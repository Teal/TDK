import { getMimeType, LiveReloadServer, LiveReloadServerOptions, WebServer, WebServerOptions } from "h2server"
import { ANSIColor, color } from "tutils/ansi"
import { FileSystemWatcher } from "tutils/fileSystemWatcher"
import { HTTPRequest, HTTPResponse } from "tutils/httpServer"
import { Asset, AssetType, AssetUpdateType, Builder, BuilderOptions } from "./builder"

/** 表示一个开发服务器 */
export class DevServer extends WebServer {

	/** 获取使用的构建器 */
	readonly builder: Builder

	/** 获取使用的监听器 */
	readonly watcher: FileSystemWatcher

	/** 获取使用的实时刷新服务器 */
	readonly liveReloadServer: LiveReloadServer

	/** 获取实时刷新的延时时间 */
	readonly liveReloadDelay: number

	/** 获取所有对外的 HTTP 接口 */
	readonly apis = {
		"livereload.js"(request: HTTPRequest, response: HTTPResponse, server: DevServer) {
			if (server.liveReloadServer) {
				server.liveReloadServer.writeScript(request, response)
			} else {
				server.writeError(request, response, 404)
			}
		},
		remoteHost(request: HTTPRequest, response: HTTPResponse, server: DevServer) {
			const { remoteIP } = require("tutils/net") as typeof import("tutils/net")
			response.end(remoteIP())
		}
	}

	/**
	 * 初始化新的开发服务器
	 * @param options 附加选项
	 */
	constructor(options?: DevServerOptions) {
		super(options?.devServer)
		Object.assign(this.apis, options?.devServer?.apis)
		this.builder = new Builder(options, this)
		const liveReload = options?.devServer?.liveReload
		if (liveReload !== false) {
			const liveReloadOptions = liveReload === true ? undefined : liveReload
			this.liveReloadServer = new LiveReloadServer({
				...liveReloadOptions,
				server: this as any
			})
			this.liveReloadServer.on("error", () => { })
			this.builder.docCompiler.options.injectFoot = `${(this.builder.docCompiler.options.injectFoot ?? "")}<script src="/tdk/api/livereload.js"></script>`
			this.liveReloadDelay = liveReloadOptions?.delay ?? 360
		}
		this.watcher = new FileSystemWatcher({
			ignore: this.builder.options.ignore
		})
		this.watcher.on("create", (path: string) => {
			this.builder.emitUpdate(path, AssetUpdateType.created)
			this.reload(path)
		})
		this.watcher.on("createDir", (path: string) => {
			this.builder.emitUpdate(path, AssetUpdateType.created)
			this.reload(path)
		})
		this.watcher.on("change", (path: string) => {
			this.builder.emitUpdate(path, AssetUpdateType.changed)
			this.reload(path)
		})
		this.watcher.on("delete", (path: string) => {
			this.builder.emitUpdate(path, AssetUpdateType.deleted)
			this.reload(path)
		})
		this.watcher.on("deleteDir", (path: string) => {
			this.builder.emitUpdate(path, AssetUpdateType.deleted)
			this.reload(path)
		})
	}

	/** 启动服务器 */
	async start(ignoreError?: boolean) {
		try {
			await super.start()
			this.builder.logger.info(`${color(`服务已启动: `, ANSIColor.brightCyan)} ${this.url}`, true)
		} catch (e) {
			if (!ignoreError) {
				if (e.code === "EADDRINUSE") {
					this.builder.logger.fatal(`无法启动服务器: 端口 ${e.port} 被其它程序占用(之前已经启动服务了?)`)
				} else {
					this.builder.logger.fatal(`无法启动服务器: ${e.stack}`)
				}
			}
			return
		}
		const watchTask = this.builder.logger.begin(`初始化监听`)
		try {
			this.watcher.add(this.builder.options.baseDir)
		} finally {
			this.builder.logger.end(watchTask)
		}
	}

	/** 关闭服务器 */
	async close() {
		await new Promise<void>(resolve => this.watcher.close(resolve))
		if (this.liveReloadServer) {
			await this.liveReloadServer.close()
		}
		await super.close()
		this.builder.logger.info(color(`服务已停止`, ANSIColor.brightCyan), true)
	}

	/** 生成哈希值的前缀 */
	private readonly _hashPrefix = `${Date.now().toString(36).slice(2)}${process.hrtime()[1].toString(36)}_`

	/** 生成哈希值的计数器 */
	private _hashSeed = 0

	/**
	 * 默认路由
	 * @param request 当前的请求对象
	 * @param response 当前的响应对象
	 */
	async defaultRouter(request: HTTPRequest, response: HTTPResponse) {
		const url = request.path.replace(/^(\/|\.\.\/)+/, "")
		if (url.startsWith("tdk/api/")) {
			const urlPath = url.substring("tdk/api/".length)
			const api = this.apis[urlPath]
			if (api) {
				return api(request, response, this)
			}
			return this.writeError(request, response, 404)
		}
		this.watcher.pause()
		try {
			const asset = await this.builder.getAsset(url) as ExtendedAsset
			switch (asset.type) {
				case AssetType.file:
					asset.hash ??= `${this._hashPrefix}${(this._hashSeed++).toString(36)}`
					const ifNoneMatch = request.headers["if-none-match"]!
					if (ifNoneMatch === asset.hash) {
						response.writeHead(304, this.headers)
						response.end()
						break
					}
					response.writeHead(200, {
						"Content-Type": getMimeType(url, { ".ts": "text/typescript", ...this.mimeTypes }) ?? "text/html",
						"ETag": asset.hash,
						...this.headers
					})
					response.end(asset.content)
					break
				case AssetType.redirect:
					response.redirect(`/${asset.content}${request.search ? "?" + request.search : ""}`)
					break
				default:
					this.writeError(request, response, 404)
					break
			}
		} finally {
			this.watcher.resume()
		}
	}

	/** 实时刷新页面计时器 */
	private _reloadTimer?: ReturnType<typeof setTimeout>

	/** 实时刷新页面 */
	private reload(path: string) {
		if (this._reloadTimer) {
			clearTimeout(this._reloadTimer)
		}
		this._reloadTimer = setTimeout(() => {
			this._reloadTimer = undefined
			this.liveReloadServer.reload(path)
		}, this.liveReloadDelay)
	}

}

/** 表示开发服务器的选项 */
export interface DevServerOptions extends BuilderOptions {
	/** 服务器的选项 */
	devServer?: WebServerOptions & {
		/** 自定义服务器接口 */
		apis?: { [name: string]: (request: HTTPRequest, response: HTTPResponse, server: DevServer) => void }
		/** 是否开启实时刷新 */
		liveReload?: boolean | LiveReloadServerOptions & {
			/** 延时刷新的等待时间（毫秒）*/
			delay?: number
		}
	}
}

/** 表示扩展的资源 */
export interface ExtendedAsset extends Asset {
	/** 资源的哈希值 */
	hash?: string
}