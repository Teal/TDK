import { formatCodeFrame } from "tutils/ansi"
import { FileSystem } from "tutils/fileSystem"
import { LogEntry, Logger, LoggerOptions } from "tutils/logger"
import { Matcher, Pattern } from "tutils/matcher"
import { concat, formatHRTime, merge } from "tutils/misc"
import { containsPath, getDir, getExt, getName, isAbsolutePath, joinPath, pathEquals, relativePath, resolvePath, setExt, setName } from "tutils/path"
import { pathToFileURL } from "url"
import { DocCompiler, DocCompilerOptions } from "./compilers/docCompiler"
import { DevServer } from "./devServer"
import { TypeScriptCompiler, TypeScriptCompileResult, TypeScriptCompilerOptions } from "./shared/typeScriptCompiler"

/** 表示一个构建器 */
export class Builder {

	/** 获取构建器的选项 */
	readonly options: BuilderOptions = {
		baseDir: ".",
		ignore: [".*", "_*", "*~", "*.tmp", "node_modules", "Desktop.ini", "Thumbs.db", "ehthumbs.db", "/dist", "/built", "/bin", "/out"],
		srcDir: "components",
		outDir: "dist",
		assetsDir: __dirname + "/../assets",
		homePageName: "index",
		mainFileName: "<dir>",
		outDefaultFile: "index.htm",
		noExtension: false,
		sourceMap: true,
		sourceMapRoot: "",
		locale: "zh-CN",
		optimize: true
	}

	/** 获取所有编译器 */
	readonly compilers: Compiler[] = [
		{
			inExts: [".js", ".tsx", ".ts", ".jsx"],
			outExt: ".js",
			compile(content, path, outPath, builder) {
				if (path === outPath) {
					return builder.compileTypeScript(content, path, undefined, undefined, undefined, {
						inlineSources: true
					})
				}
				return builder.compileTypeScript(content, path)
			}
		},
		{
			inExts: [".scss", ".sass"],
			outExt: ".css",
			use: resolvePath(__dirname, "./compilers/sassCompiler")
		},
		{
			inExts: [".less"],
			outExt: ".css",
			use: resolvePath(__dirname, "./compilers/lessCompiler")
		},
		{
			inExts: [".md"],
			outExt: ".html",
			compile(content, path, outPath, builder) {
				return builder.docCompiler.buildDocPage(content, path, outPath)
			}
		},
		{
			inExts: [".tsx", ".ts", ".jsx", ".js"],
			outExt: ".html",
			compile(content, path, outPath, builder) {
				return builder.docCompiler.buildDocPage("", path, outPath)
			}
		},
		{
			inExts: [".svg"],
			outExt: ".html",
			use: resolvePath(__dirname, "./compilers/svgViewer")
		},
	]

	/** 获取使用的 TypeScript 编译器 */
	readonly typeScriptCompiler: TypeScriptCompiler

	/**
	 * 编译一段 TypeScript
	 * @param content 要编译的源码，如果为 `undefined` 则自动从路径读取
	 * @param fileName 源码的绝对路径，用于查找和该路径相关的配置以及解析源码中导入的相对路径
	 * @param checkErrors 是否检查错误，如果为 `transpileOnly` 则只检查语法错误，忽略类型错误
	 * @param moduleName 如果要生成 AMD 模块，则指定当前模块名
	 * @param renameModuleName 重命名导入模块名的回调函数
	 * @param options 针对当前文件的编译器选项
	 */
	compileTypeScript(content: string, fileName: string, checkErrors: boolean | "transpileOnly" = "transpileOnly", moduleName?: string, renameModuleName?: TypeScriptCompilerOptions["renameModuleName"], options?: TypeScriptCompilerOptions["compilerOptions"]) {
		const result = this.typeScriptCompiler.compile(content, fileName, checkErrors, moduleName, renameModuleName, options)
		if (result.errors.length) {
			result.errors = result.errors.map(error => {
				const startLoc = error.file.getLineAndCharacterOfPosition(error.start)
				const endLoc = error.file.getLineAndCharacterOfPosition(error.start + error.length)
				return {
					message: typeof error.messageText === "string" ? error.messageText : error.messageText.messageText,
					fileName: error.file.fileName,
					line: startLoc.line,
					column: startLoc.character,
					endLine: endLoc.line,
					endColumn: endLoc.character,
					codeFrame: formatCodeFrame(error.file.text, startLoc.line, startLoc.character, endLoc.line, endLoc.character)
				} as LogEntry
			}) as any
		}
		return result as Omit<TypeScriptCompileResult, "errors"> & CompileResult
	}

	/** 获取外部包编译器 */
	readonly externalPackageCompiler = { use: resolvePath(__dirname, "./compilers/externalPackageCompiler") } as Compiler

	/** 获取使用的文档编译器 */
	readonly docCompiler: DocCompiler

	/** 获取使用的文件系统 */
	readonly fs: FileSystem

	/** 获取使用的日志记录器 */
	readonly logger: Logger

	/** 关联的开发服务器 */
	readonly devServer?: DevServer

	/**
	 * 初始化新的构建器
	 * @param options 附加选项
	 * @param devServer 关联的开发服务器
	 */
	constructor(options?: BuilderOptions, devServer?: DevServer) {
		options = Object.assign(this.options, options)
		this.devServer = devServer
		if (!devServer) {
			this.options = options = merge(options, options.build) || options
		}
		options.baseDir = resolvePath(options.baseDir)
		options.srcDir = resolvePath(options.baseDir, options.srcDir)
		options.outDir = resolvePath(options.baseDir, options.outDir)
		options.assetsDir = resolvePath(options.baseDir, options.assetsDir)
		if (options.compilers != undefined) {
			this.compilers.unshift(...options.compilers)
		}
		this.fs = options.fs ?? new FileSystem()
		this.logger = new Logger({
			errorOrWarningCounter: false,
			...options.logger
		})
		options.modules ??= {}
		options.modules["assert"] ??= "/tdk/assert"
		this.typeScriptCompiler = new TypeScriptCompiler({
			baseDir: options.baseDir,
			compilerOptions: {
				module: "amd",
				locale: `zh-cn`,
				sourceMap: options.sourceMap,
				sourceRoot: options.sourceMapRoot,
				...options.ts,
				strictNullChecks: false
			},
			renameModuleName: (moduleName, sourceFile) => {
				const builtinModule = options.modules[moduleName]
				if (builtinModule) {
					return builtinModule
				}
				const containingFile = sourceFile.fileName
				const resolvedModule = sourceFile.resolvedModules.get(moduleName)
				let resolvedFileName: string
				if (resolvedModule) {
					resolvedFileName = /\.d\.ts$/i.test(resolvedModule.resolvedFileName) ? this.typeScriptCompiler.resolveJSModuleName(moduleName, containingFile) || moduleName : setExt(resolvedModule.resolvedFileName, ".js")
					if (resolvedModule.isExternalLibraryImport) {
						const nodeModules = resolvePath(this.options.baseDir, "node_modules")
						let path = relativePath(nodeModules, resolvedFileName)
						if (path.startsWith("../")) {
							path = resolvedFileName.replace(/\\/g, "/")
							if (process.platform === "win32") {
								path = path.replace(/^(\w):/, "$1")
							}
							path = "~/" + path
						}
						this.vendors?.push(`tdk/vendors/${path}`)
						return `/tdk/vendors/${path}`
					}
				} else {
					const outName = this.getOutputNames(moduleName).find(url => url.endsWith(".css"))
					if (outName) {
						if (outName.startsWith("~/")) {
							resolvedFileName = resolvePath(this.options.baseDir, this.options.srcDir, outName.substring(2))
						} else {
							resolvedFileName = resolvePath(containingFile, "..", outName)
						}
					} else {
						return null
					}
				}
				const path = relativePath(getDir(containingFile), resolvedFileName)
				if (path.startsWith("../")) {
					return path
				}
				if (isAbsolutePath(path)) {
					return pathToFileURL(path).toString()
				}
				return "./" + path
			},
			plugins: options.ts?.plugins,
		})
		this.docCompiler = new DocCompiler(this)
		if (this.options.plugins) {
			for (const plugin of this.options.plugins) {
				const pluginFunction = typeof plugin === "string" ? this.loadPlugin(plugin).default as BuilderPlugin : plugin
				pluginFunction(this)
			}
		}
	}

	/**
	 * 载入一个插件
	 * @param name 要载入的插件名
	 */
	protected loadPlugin(name: string) {
		return require(require.resolve(name, { paths: [process.cwd()] }))
	}

	/** 已生成的资源缓存，键为资源地址 */
	private readonly _assets = new Map<string, Asset | Promise<Asset>>()

	/**
	 * 获取指定地址对应的资源
	 * @param url 要获取的地址
	 */
	async getAsset(url: string): Promise<Asset> {
		if (/\.map$/i.test(url)) {
			const asset = await this.getAsset(url.slice(0, -".map".length))
			if (asset.sourceMap) {
				return asset.sourceMap
			}
		}
		let asset = this._assets.get(url)
		if (asset !== undefined) {
			if (asset instanceof Promise) {
				asset = await asset
			}
			return asset
		}
		const promise = this.loadAsset(url)
		this._assets.set(url, promise)
		try {
			asset = await promise
		} catch (e) {
			this._assets.delete(url)
			this.logger.error(e)
			throw e
		}
		if (asset.errors?.length) {
			this._assets.delete(url)
			for (const error of asset.errors) {
				if (error.warning) {
					this.logger.warning(error)
				} else {
					this.logger.error(error)
				}
			}
		} else {
			this._assets.set(url, asset)
			if (asset.dependencies) {
				for (const dependency of asset.dependencies) {
					this.watch(dependency, url)
				}
			}
		}
		return asset
	}

	/**
	 * 生成指定的资源
	 * @param url 资源的内部路径，如 `components/ui/button`
	 */
	protected async loadAsset(url: string): Promise<Asset> {
		if (url.startsWith("tdk/")) {
			// tdk/data/
			if (url.startsWith("data/", "tdk/".length)) {
				const compileResult = await this.docCompiler.buildData(url.substring("tdk/data/".length))
				if (compileResult !== undefined) {
					return {
						type: AssetType.file,
						content: compileResult.content,
						errors: compileResult.errors,
						dependencies: compileResult.dependencies,
					}
				}
			}
			// tdk/vendors/
			if (url.startsWith("vendors/", "tdk/".length)) {
				const moduleName = url.slice("tdk/vendors/".length)
				const path = moduleName.startsWith("~/") ? process.platform === "win32" ? moduleName.slice(2).replace(/^(\w)\//, "$1:\\").replace(/\//g, "\\") : moduleName.slice(2) : resolvePath(this.options.baseDir, "node_modules", moduleName)
				// 出于安全原因考虑，只允许访问路径中存在 node_modules 的模块
				if (!/[\\/]node_modules[\\/]/i.test(path)) {
					return {
						type: AssetType.notFound
					}
				}
				return this.runCompiler(this.externalPackageCompiler, moduleName, path, path)
			}
			// tdk/unittest.html
			if (url === "tdk/unittest.html") {
				const compileResult = await this.docCompiler.buildUnitTestPage(url)
				if (compileResult !== undefined) {
					return {
						type: AssetType.file,
						content: compileResult.content,
						errors: compileResult.errors,
						dependencies: compileResult.dependencies,
					}
				}
			}
		}
		// dir/ -> dir/index.html
		let orgiginalURL: string | undefined
		if (!url) {
			orgiginalURL = url
			url = `${this.options.homePageName}.html`
		} else if (url.endsWith("/")) {
			orgiginalURL = url
			url += `${this.getMainFileName(url)}.html`
		}
		// file.ts -> file.js
		const dependencies: string[] = []
		const path = url.startsWith("tdk/assets/") ? joinPath(this.options.assetsDir, url.substring("tdk/assets/".length)) : joinPath(this.options.baseDir, url)
		const ext = getExt(url).toLowerCase()
		const prefix = path.slice(0, -ext.length)
		for (const compiler of this.compilers) {
			if (compiler.outExt === ext) {
				for (const inExt of compiler.inExts) {
					const sourcePath = prefix + inExt
					dependencies.push(sourcePath)
					const content = await this.fs.readText(sourcePath, false)
					if (content === null) {
						continue
					}
					const result = await this.runCompiler(compiler, content, sourcePath, prefix + compiler.outExt)
					result.dependencies = concat(dependencies, result.dependencies)
					return result
				}
			}
		}
		// file.js
		dependencies.push(path)
		try {
			return {
				type: AssetType.file,
				content: await this.fs.readFile(path),
				dependencies,
			}
		} catch (e) {
			switch (e.code) {
				case "ENOENT":
					if (orgiginalURL !== undefined) {
						break
					}
					return {
						type: AssetType.notFound,
						dependencies
					}
				case "EISDIR":
					return {
						type: AssetType.redirect,
						content: url + "/",
						dependencies
					}
				default:
					throw e
			}
		}
		// /
		if (!orgiginalURL) {
			const compileResult = this.docCompiler.buildHomePage(orgiginalURL)
			return {
				type: AssetType.file,
				content: compileResult.content,
				errors: compileResult.errors,
				dependencies: compileResult.dependencies,
			}
		}
		// dir/
		const dir = getDir(path)
		if (await this.fs.existsDir(dir)) {
			const compileResult = await this.docCompiler.buildIndexPage(dir)
			return {
				type: AssetType.file,
				content: compileResult.content,
				errors: compileResult.errors,
				dependencies: concat([dir], compileResult.dependencies),
			}
		}
		return {
			type: AssetType.notFound,
			dependencies
		}
	}

	/**
	 * 获取指定文件夹的首页名（不含扩展名）
	 * @param dir 文件夹名
	 */
	getMainFileName(dir: string) {
		return this.options.mainFileName.replace("<dir>", getName(dir)).replace("<locale>", this.options.locale)
	}

	/**
	 * 使用指定的编译器编译指定的文件
	 * @param compiler 要使用的编译器
	 * @param content 要编译的内容
	 * @param path 要编译的路径
	 * @param outPath 输出的路径
	 */
	async runCompiler(compiler: Compiler, content: string, path: string, outPath: string) {
		const compileTask = this.logger.begin(`正在生成`, this.logger.formatPath(path))
		try {
			const compile = compiler.compile ??= this.loadPlugin(compiler.use).default as Compiler["compile"]
			const compileResult = await compile(content, path, outPath, this)
			if (compileResult.errors?.length) {
				for (const error of compileResult.errors) {
					if (error.codeFrame === undefined && error.fileName && error.line !== undefined) {
						error.codeFrame = formatCodeFrame(error.fileName === path ? content : await this.fs.readText(error.fileName, false) || "", error.line, error.column, error.endLine, error.endColumn)
					}
				}
				compileResult.content = this.docCompiler.buildErrorPage(compileResult.errors, getExt(outPath).toLowerCase(), compileResult.content)
				compileResult.sourceMap = undefined
			}
			return {
				type: AssetType.file,
				content: compileResult.content,
				sourceMap: compileResult.sourceMap ? {
					type: AssetType.file,
					content: compileResult.sourceMap
				} : undefined,
				errors: compileResult.errors,
				dependencies: compileResult.dependencies
			} as Asset
		} finally {
			this.logger.end(compileTask)
		}
	}

	/** 所有监听依赖的缓存，键为监听的绝对路径 */
	private readonly _watchingFiles = new Map<string, ((() => void) | string)[]>()

	/** 监听的回调函数 */
	private readonly _watchingCallbacks: [DependencyCallback, (() => void) | string][] = []

	/**
	 * 添加指定的路径更新后的回调函数
	 * @param path 要监听的绝对路径
	 * @param callback 要添加的回调函数或资源地址
	 */
	watch(path: string | ((path: string, type: AssetUpdateType) => boolean), callback: (() => void) | string) {
		if (typeof path === "function") {
			this._watchingCallbacks.push([path, callback])
			return
		}
		if (this.fs.isCaseInsensitive) {
			path = path.toLowerCase()
		}
		const cache = this._watchingFiles.get(path)
		if (cache) {
			cache.push(callback)
		} else {
			this._watchingFiles.set(path, [callback])
		}
	}

	/**
	 * 删除指定的路径更新后的回调函数
	 * @param path 监听的绝对路径
	 * @param callback 要删除的回调函数或资源地址
	 */
	unwatch(path: string | ((path: string, type: AssetUpdateType) => boolean), callback: (() => void) | string) {
		if (typeof path === "function") {
			const index = this._watchingCallbacks.findIndex(item => item[0] === path && item[1] === callback)
			if (index >= 0) {
				this._watchingCallbacks.splice(index, 1)
			}
			return
		}
		if (this.fs.isCaseInsensitive) {
			path = path.toLowerCase()
		}
		const cache = this._watchingFiles.get(path)
		if (cache) {
			const index = cache.indexOf(callback)
			if (index >= 0) {
				cache.splice(index, 1)
			}
		}
	}

	/**
	 * 通知指定的路径已更新
	 * @param path 更新的文件绝对路径
	 * @param type 更新的类型
	 */
	emitUpdate(path: string, type: AssetUpdateType) {
		for (let i = this._watchingCallbacks.length - 1; i >= 0; i--) {
			if (this._watchingCallbacks[i][0](path, type)) {
				const callback = this._watchingCallbacks.splice(i, 1)[0][1]
				if (typeof callback === "string") {
					this._assets.delete(callback)
				} else {
					callback()
				}
			}
		}
		if (this.fs.isCaseInsensitive) {
			path = path.toLowerCase()
		}
		this.typeScriptCompiler.emitUpdate(path)
		const cache = this._watchingFiles.get(path)
		if (cache) {
			while (cache.length) {
				const callback = cache.pop()
				if (typeof callback === "string") {
					this._assets.delete(callback)
				} else {
					callback()
				}
			}
		}
	}

	/** 判断是否正在执行最终构建 */
	building = false

	/** 依赖的三方包 */
	protected vendors: string[] | undefined

	/**
	 * 立即构建资源
	 * @param clean 是否在构建前清理目标文件夹
	 * @param url 要构建的资源地址，如果为空则构建所有资源
	 */
	async build(clean = true, url?: string) {
		const startTime = process.hrtime()
		if (clean && !url) {
			const task = this.logger.begin(`正在清理“${this.logger.formatPath(this.options.outDir)}”文件夹`)
			await this.fs.cleanDir(this.options.outDir)
			this.logger.end(task)
		}
		this.building = true
		this.vendors = []
		const rootDir = url ? resolvePath(this.options.baseDir, url) : null
		// 扫描并编译项目内所有资源
		const assets: Promise<Asset>[] = []
		const dirs = [this.options.baseDir, this.options.assetsDir, this.options.srcDir]
		for (let i = 0; i < dirs.length; i++) {
			await this.fs.walk(dirs[i], {
				dir: path => i === 1 || !this.isIgnored(path),
				file: path => {
					if (i !== 1 && this.isIgnored(path) || rootDir && !containsPath(rootDir, path, this.fs.isCaseInsensitive)) {
						return false
					}
					let url = relativePath(i === 1 ? this.options.assetsDir : this.options.baseDir, path)
					if (i === 1) {
						url = joinPath("tdk/assets", url)
					}
					if (i === 2) {
						assets.push(this.buildModule(url))
						return
					}
					assets.push(this.buildAsset(url))
					for (const outURL of this.getOutputNames(url)) {
						// 忽略 assets 下文件生成的文档
						if (i === 1 && outURL.endsWith(".html") && !url.endsWith(".html")) {
							continue
						}
						if (outURL === url) {
							continue
						}
						assets.push(this.buildAsset(outURL))
					}
				}
			})
		}
		// 复制包文件
		try {
			await this.fs.copyFile("package.json", resolvePath(this.options.outDir, "tdk/lib", "package.json"))
		} catch { }
		// 确保所有资源都生成结束
		await Promise.all(assets)
		// 生成的页面
		const generatedAssets: Promise<Asset>[] = []
		for await (const url of this.getGeneratedURLs()) {
			if (rootDir && !containsPath(rootDir, this.toPath(url), this.fs.isCaseInsensitive)) {
				continue
			}
			generatedAssets.push(this.buildAsset(url))
		}
		await Promise.all(generatedAssets)
		const time = process.hrtime(startTime)
		this.logger.success(`已全部生成到“${this.logger.formatPath(url ? joinPath(this.options.outDir, url) : this.options.outDir)}”，共 ${assets.length + generatedAssets.length} 个文件，耗时 ${formatHRTime(time)}`)
		this.building = false
	}

	/**
	 * 构建指定地址对应的文件
	 * @param url 要构建的地址
	 */
	protected async buildAsset(url: string) {
		const asset = await this.getAsset(url)
		if (asset.type === AssetType.file) {
			// 重命名首页
			let outURL = url
			if (!outURL || outURL.endsWith("/")) {
				outURL += this.options.outDefaultFile
			} else if (getName(url) === this.getMainFileName(getDir(outURL)) + ".html") {
				outURL = setName(url, this.options.outDefaultFile)
			}
			const outPath = resolvePath(this.options.outDir, outURL)
			const task = this.logger.begin(`正在写入 ${this.logger.formatPath(outPath)}`)
			if (asset.sourceMap) {
				await this.fs.writeFile(outPath + ".map", asset.sourceMap.content)
			}
			await this.fs.writeFile(outPath, asset.content)
			this.logger.end(task)
		}
		return asset
	}

	/**
	 * 构建指定地址对应的模块
	 * @param url 要构建的地址
	 */
	protected async buildModule(url: string) {
		let asset: Asset
		let outPath = resolvePath(this.options.outDir, "tdk/lib", relativePath(this.options.srcDir, url))
		if (/\.[jt]sx?$/i.test(url)) {
			const path = this.toPath(url)
			const content = await this.fs.readText(path)
			const compileResult = this.compileTypeScript(content, path, "transpileOnly", undefined, null, {
				module: "esnext"
			})
			asset = {
				type: AssetType.file,
				content: compileResult.content,
				sourceMap: compileResult.sourceMap ? {
					type: AssetType.file,
					content: compileResult.sourceMap
				} : undefined,
				errors: compileResult.errors,
				dependencies: compileResult.dependencies
			}
			outPath = setExt(outPath, ".js")
			if (compileResult.declaration) {
				const declarationPath = setExt(outPath, ".d.ts")
				const task = this.logger.begin(`正在写入 ${this.logger.formatPath(declarationPath)}`)
				await this.fs.writeFile(declarationPath, compileResult.declaration)
				this.logger.end(task)
			}
		} else if (getName(url).toLowerCase() === "package.json") {
			const path = this.toPath(url)
			const content = await this.fs.readText(path)
			const data = JSON.parse(content)
			if (!data.main && data.types) {
				data.main = setExt(data.types, ".js")
			}
			asset = {
				type: AssetType.file,
				content: JSON.stringify(data, undefined, 2),
				dependencies: [path]
			}
		} else if (/\.md$/i.test(url)) {
			const path = this.toPath(url)
			asset = {
				type: AssetType.file,
				content: await this.fs.readFile(path),
				dependencies: [path]
			}
		} else {
			asset = await this.getAsset(url)
			outPath = this.getOutputName(outPath)
		}
		if (asset.type === AssetType.file) {
			const task = this.logger.begin(`正在写入 ${this.logger.formatPath(outPath)}`)
			if (asset.sourceMap) {
				await this.fs.writeFile(outPath + ".map", asset.sourceMap.content)
			}
			await this.fs.writeFile(outPath, asset.content)
			this.logger.end(task)
		}
		return asset
	}

	private _rootDirNames: string[] | undefined

	/**
	 * 获取项目的根文件夹
	 */
	async getRootDirNames() {
		return this._rootDirNames ??= (await this.fs.readDir(this.options.baseDir, true)).filter(entry => entry.isDirectory() && !this.isIgnored(this.toPath(entry.name + "/"))).map(entry => entry.name)
	}

	/**
	 * 获取动态生成的所有文件的地址
	 */
	protected async *getGeneratedURLs() {
		// 首页
		yield ""
		// 列表页
		for (const rootDirName of await this.getRootDirNames()) {
			yield rootDirName + "/"
		}
		// 数据
		for await (const dataURL of this.docCompiler.getGeneratedDataURLs()) {
			yield `tdk/data/${dataURL}`
		}
		// 三方包
		yield* this.vendors
	}

	/**
	 * 返回指定路径的访问地址
	 * @param path 要获取的绝对路径
	 */
	toURL(path: string) {
		return relativePath(this.options.baseDir, path)
	}

	/**
	 * 获取访问指定资源的最短地址
	 * @param path 要访问的资源路径
	 */
	toShortURL(path: string) {
		const url = this.toURL(path)
		if (url === `${this.options.homePageName}.html`) {
			return ""
		}
		if (getName(path) === this.getMainFileName(getDir(path)) + ".html") {
			return getDir(url)
		}
		return url
	}

	/**
	 * 返回指定地址对应的绝对路径
	 * @param path 要获取的地址
	 */
	toPath(url: string) {
		return joinPath(this.options.baseDir, url)
	}

	/**
	* 获取指定模块生成的模块名
	* @param name 源模块名
	*/
	getOutputName(name: string) {
		const ext = getExt(name).toLowerCase()
		for (const compiler of this.compilers) {
			if (compiler.inExts.includes(ext)) {
				return setExt(name, compiler.outExt)
			}
		}
		return name
	}

	/**
	* 获取指定模块生成的所有模块名
	* @param name 源模块名
	*/
	getOutputNames(name: string) {
		const result: string[] = []
		const ext = getExt(name).toLowerCase()
		for (const compiler of this.compilers) {
			if (compiler.inExts.includes(ext)) {
				result.push(setExt(name, compiler.outExt))
			}
		}
		if (!result.length) {
			result.push(name)
		}
		return result
	}

	/**
	 * 获取指定模块生成的 HTML 模块名，如果模块无法生成 HTML，则返回原地址
	 * @param name 源模块名
	 */
	getHTMLOutputName(name: string) {
		const ext = getExt(name).toLowerCase()
		for (const compiler of this.compilers) {
			if (compiler.outExt === ".html" && compiler.inExts.includes(ext)) {
				return setExt(name, this.options.noExtension ? "" : compiler.outExt)
			}
		}
		return name
	}

	/**
	 * 计算生成指定文件的源文件名，如果找不到则返回 `undefined`
	 * @param name 生成的文件名
	 * @param entries 文件夹下的所有文件名
	 */
	getInputName(name: string, entries: string[]) {
		const ext = getExt(name).toLowerCase()
		for (const compiler of this.compilers) {
			if (compiler.outExt === ext) {
				for (const inExt of compiler.inExts) {
					const inName = setExt(name, inExt)
					if (entries.some(item => pathEquals(item, inName, this.fs.isCaseInsensitive))) {
						return inName
					}
				}
			}
		}
	}

	/** 忽略路径匹配器 */
	private _ignoreMatcher: Matcher

	/**
	 * 判断指定的路径是否被忽略
	 * @param path 要判断的绝对路径
	 */
	isIgnored(path: string) {
		if (!containsPath(this.options.baseDir, path, this.fs.isCaseInsensitive)) {
			return true
		}
		if (!this._ignoreMatcher) {
			this._ignoreMatcher = new Matcher(this.options.ignore, this.options.baseDir, this.fs.isCaseInsensitive)
			this._ignoreMatcher.include(this.options.outDir)
		}
		return this._ignoreMatcher.test(path)
	}

}

/** 表示构建器的选项 */
export interface BuilderOptions {
	/** 配置文件中所有路径的基路径 */
	baseDir?: string
	/**
	 * 监听和生成的忽略列表
	 * @default [".*", "_*\/", "*~", "*.tmp", "node_modules", "Desktop.ini", "Thumbs.db", "ehthumbs.db"]
	 * */
	ignore?: Pattern
	/**
	 * 存放源码的文件夹路径
	 * @default "components"
	 */
	srcDir?: string
	/**
	 * 构建生成的文件夹路径
	 * @default "dist"
	 */
	outDir?: string
	/** 静态资源文件夹路径 */
	assetsDir?: string
	/**
	 * 设置项目主页文件名
	 * @default "index"
	 * @example "README"
	 */
	homePageName?: string
	/**
	 * 设置文件夹的主文件名（不含扩展名），其中 `<dir>` 表示文件夹名本身，`<locale>` 表示当前语言
	 * @default "<dir>"
	 */
	mainFileName?: string
	/**
	 * 设置输出的默认文件名
	 * @default "index.htm"
	 */
	outDefaultFile?: string
	/**
	 * 设置输出 HTML 文件名时删除扩展名
	 * @default false
	 */
	noExtension?: boolean
	/** 使用的文件系统 */
	fs?: FileSystem
	/** 使用的语言（如 `en-US`） */
	locale?: string

	/** 自定义编译器列表 */
	compilers?: Compiler[]
	/** 日志记录器的选项 */
	logger?: LoggerOptions
	/**
	 * 开发时是否启用源映射
	 * @default true
	 */
	sourceMap?: boolean
	/**
	 * 源映射的根地址，默认为空表示相对目录，"file:///" 表示使用绝对路径
	 * @default ""
	 */
	sourceMapRoot?: string
	/**
	 * 发布时是否优化生成的代码
	 * @default true
	 */
	optimize?: boolean

	/** 内置 TypeScript 编译器的附加选项 */
	ts?: any
	/** 内置 Sass 编译器的附加选项 */
	sass?: any
	/** 内置 Less 编译器的附加选项 */
	less?: any
	/** 内置 Webpack 编译器的附加选项 */
	webpack?: any
	/** 内置 Markdown 编译器的附加选项 */
	md?: any
	/** 内置文档编译器的附加选项 */
	doc?: DocCompilerOptions
	/** 配置供代码加载的内置模块 */
	modules?: { [name: string]: string }

	/** 一次性构建时额外设置的选项 */
	build?: BuilderOptions
	/** 所有附加插件 */
	plugins?: (string | BuilderPlugin)[]
}

/** 表示一个编译器 */
export interface Compiler {
	/** 输入的文件扩展名(含点) */
	inExts: string[]
	/** 输出的文件扩展名(含点) */
	outExt: string
	/** 编译器的源路径 */
	use?: string
	/**
	 * 编译指定的模块
	 * @param content 模块的源内容
	 * @param path 模块的源绝对路径
	 * @param outPath 生成的目标绝对路径
	 * @param builder 当前的构建器对象
	 * @returns 返回编译的结果对象
	 */
	compile?(content: string, path: string, outPath: string, builder: Builder): CompileResult | Promise<CompileResult>
}

/** 表示编译结果 */
export interface CompileResult {
	/** 生成的内容 */
	content?: string | Buffer
	/** 生成的源映射 */
	sourceMap?: string | Buffer
	/** 生成时产生的错误 */
	errors?: LogEntry[]
	/** 生成所依赖的文件路径，当任一依赖变化后需要重新生成 */
	dependencies?: (string | DependencyCallback)[]
}

/**
 * 表示检测依赖的回调函数
 * @param path 发生变化的资源绝对路径
 * @param updateType 发生变化的类型
 */
export type DependencyCallback = (path: string, updateType: AssetUpdateType) => boolean

/** 表示一个构建器插件 */
export type BuilderPlugin = (builder: Builder) => void

/** 表示一个资源 */
export interface Asset {
	/** 资源的类型 */
	type: AssetType
	/** 资源的内容，可以是文件的内容或重定向的地址 */
	content?: string | Buffer
	/** 如果当前资源存在源映射，则为关联的源映射资源 */
	sourceMap?: Asset
	/** 构建时产生的所有错误 */
	errors?: CompileResult["errors"]
	/** 构建当前资源所依赖的文件路径，当任一依赖文件变化后需要重新构建 */
	dependencies?: CompileResult["dependencies"]
}

/** 表示资源的类型 */
export const enum AssetType {
	/** 资源不存在 */
	notFound,
	/** 当前资源是一个文件 */
	file,
	/** 当前资源需要外部重定向到另一个资源 */
	redirect,
}

/** 表示资源更新的类型 */
export const enum AssetUpdateType {
	/** 资源被创建 */
	created,
	/** 资源被修改 */
	changed,
	/** 资源被删除 */
	deleted,
}