/**
 * @fileoverview require.js - A light-weight AMD loader
 * @author xuld<xuld@xuld.net>
 * @license MIT
 */

/**
 * 加载指定的模块及其依赖，如果模块已加载则直接返回
 * @param {string | string[]} name 要加载的模块名
 * @param {Function} [callback] 模块加载成功后的回调函数，参数为模块的导出对象
 * @param {Function} [onError] 模块加载失败后的回调函数
 * @param {string} [baseURL] 解析模块地址时使用的基地址
 * @returns 如果模块已加载，则返回模块的导出项
 */
function require(name, callback, onError, baseURL) {
	const dependencies = typeof name === "string" ? [name] : name.slice(0)
	const entryModule = {
		state: 2 /* fetched */,
		dependencies,
		exports: {},
		define: callback,
		onError: onError
	}
	let last = require._entryModule
	if (last) {
		while (last.next) {
			last = last.next
		}
		last.next = entryModule
	} else {
		require._entryModule = entryModule
	}
	require._ensure(entryModule, baseURL)
	return entryModule.state < 4 /* executed */ ? undefined : typeof name === "string" ? dependencies[0] : dependencies
}

/** 获取所有已加载的模块 */
require.cache = { __proto__: null }

/** 确保指定模块及其依赖都已加载 */
require._ensure = (module, baseURL) => {
	if (module.state !== 2 /* fetched */) {
		return
	}
	module.state = 3 /* resolved */
	const { dependencies } = module
	if (dependencies) {
		for (let i = 0; i < dependencies.length; i++) {
			let dependencyModule
			const dependencyName = dependencies[i]
			switch (dependencyName) {
				case "exports":
					dependencyModule = module
					break
				case "require":
					dependencyModule = { state: 4 /* executed */, exports: (name, callback) => require(name, callback, baseURL) }
					break
				case "module":
					dependencyModule = { state: 4 /* executed */, exports: module }
					break
				default:
					require._pending++
					const dependencyURL = require.resolve(dependencyName, baseURL)
					if (dependencyModule = require.cache[dependencyURL]) {
						require._ensure(dependencyModule, dependencyURL)
						require._pending--
					} else {
						require.cache[dependencyURL] = dependencyModule = { state: 1 /* fetching */ }
						require.load(dependencyURL, () => {
							require._ensure(dependencyModule, dependencyURL)
							if (!--require._pending) {
								require._ready()
							}
						}, () => {
							delete require.cache[dependencyURL]
							dependencyModule.state = 5 /* error */
							if (!--require._pending) {
								require._ready()
							}
							throw new Error(`Cannot load module '${dependencyName}' (from '${baseURL || "<entry>"}')`)
						})
					}
					break
			}
			dependencies[i] = dependencyModule
		}
	}
	if (!require._pending) {
		require._ready()
	}
}

/** 获取正在等待加载的模块数 */
require._pending = 0

/** 当所有模块加载完成后执行 */
require._ready = () => {
	const entryModule = require._entryModule
	if (entryModule) {
		require._entryModule = entryModule.next
		entryModule.next = undefined
		try {
			require._execute(entryModule)
		} finally {
			require._ready()
		}
	}
}

/** 当模块及依赖都已加载完成后负责执行指定的模块 */
require._execute = module => {
	if (module.state >= 4 /* executed */) {
		return
	}
	module.state = 4 /* executed */
	const { dependencies } = module
	if (dependencies) {
		for (let i = 0; i < dependencies.length; i++) {
			const dependency = dependencies[i]
			if (dependency.state === 5 /* error */) {
				module.state = 5 /* error */
				if (module.onError) {
					module.onError()
					module.onError = undefined
				}
				return
			}
			require._execute(dependency)
			dependencies[i] = dependency.exports
		}
		module.dependencies = undefined
	}
	const define = module.define
	if (define) {
		const exports = dependencies ? define(...dependencies) : define()
		if (exports !== undefined) {
			module.exports = exports
		}
		module.define = undefined
	}
}

/**
 * 解析指定模块名的绝对地址
 * @param {string} name 要解析的模块名
 * @param {string} [baseURL] 解析使用的基地址
 */
require.resolve = (name, baseURL) => {
	if (/^\.\.?(\/|$)/.test(name)) {
		name = (baseURL || require.currentScript()).replace(/[^\/]*$/, "") + name.replace(/^\.\//, "")
	} else if (name.charCodeAt(0) === 47 /*/*/) {
		name = `${location.protocol}${name.charCodeAt(1) === 47 /*/*/ ? name : `//${location.host}${name}`}`
	} else if (!/:\/\//.test(name)) {
		name = `${location.protocol}//${location.host}${location.pathname.replace(/\/[^\/]*$/, "/")}${name}`
	}
	let slashIndex
	while ((slashIndex = name.search(/\/\.\.?(\/|$)/)) >= 0) {
		if (name.charCodeAt(slashIndex + 2) === 46 /*.*/) {
			const left = name.slice(0, name.lastIndexOf("/", slashIndex - 1) + 1)
			if (!/^.*:\/\/[^/]*\//.test(left)) {
				break
			}
			name = left + name.slice(slashIndex + 4)
		} else {
			name = name.slice(0, slashIndex + 1) + name.slice(slashIndex + 3)
		}
	}
	return name
}

/** 获取或设置请求模块时在地址后追加的参数 */
require.urlArgs = ""

/**
 * 底层加载一个模块
 * @param {string} url 要加载的地址
 * @param {Function} onLoad 加载成功的回调函数
 * @param {Function} [onError] 加载失败的回调函数
 */
require.load = (url, onLoad, onError) => {
	const match = /\.[^\.\/\\]+$/.exec(url)
	const loader = match && require.extensions[match[0].toLowerCase()] || require.extensions[".js"]
	loader(url, onLoad, onError)
}

/** 获取不同扩展名的载入方式 */
require.extensions = {
	".js"(url, onLoad, onError) {
		// 如果浏览器不支持 document.currentScript，使用单线程下载脚本，以便脚本内部可以获取当前路径
		if (require._loadQueue) {
			if (require._currentScript) {
				require._loadQueue.push({ url, onLoad, onError })
				return
			}
			require._currentScript = url
		}
		const script = document.createElement("script")
		script.async = true
		script.onload = script.onreadystatechange = () => {
			const readyState = script.readyState
			if (readyState == undefined || readyState == "loaded" || readyState == "complete") {
				script.onload = script.onreadystatechange = null
				onLoad()
				if (require._loadQueue) {
					require._currentScript = undefined
					const next = require._loadQueue.shift()
					if (next) {
						require.extensions[".js"](next.url, next.onLoad, next.onError)
					}
				}
			}
		}
		script.onerror = onError
		script.src = url + require.urlArgs
		const lastNode = require._lastNode("script")
		lastNode.parentNode.insertBefore(script, lastNode.nextSibling)
	},
	".css"(url, onLoad, onError) {
		const link = document.createElement("link")
		link.rel = "stylesheet"
		link.href = url + require.urlArgs
		// 部分浏览器不支持 link.onload/link.onerror 事件：https://pie.gd/test/script-link-events/
		if ("onload" in link) {
			link.onload = onLoad
		} else {
			setTimeout(onLoad, 30)
		}
		link.onError = onError
		const lastNode = require._lastNode("link")
		if (lastNode) {
			lastNode.parentNode.insertBefore(link, lastNode.nextSibling)
		} else {
			(document.head || document.documentElement).appendChild(link)
		}
		define(url, () => {
			const lastNode = require._lastNode("link")
			lastNode.parentNode.insertBefore(link, lastNode.nextSibling)
		})
	},
	".svg"(url, onLoad) {
		define(url, () => url)
		onLoad()
	}
}
".webp.png.ico.jpg.gif.bmp.jpeg.cur.woff2.woff.ttf.eot.amr.mp3.wav.webm.mp4.ogg".replace(/\.\w+/g, ext => {
	require.extensions[ext] = require.extensions[".svg"]
})

/** 获取指定类型的最后一个节点 */
require._lastNode = tagName => {
	const nodes = document.getElementsByTagName(tagName)
	return nodes[nodes.length - 1]
}

/** 获取当前正在执行的脚本的绝对路径 */
require.currentScript = () => {
	if (require._currentScript) {
		return require._currentScript
	}
	const script = document.currentScript
	const src = (script && script.src || location.href).replace(/[?#].*$/, "")
	try {
		return decodeURIComponent(src)
	} catch {
		return src
	}
}

if (!("currentScript" in document)) {
	require._loadQueue = []
}

/**
 * 定义一个模块
 * @param {string} [name] 模块名
 * @param {string[]} [dependencies] 模块的所有依赖项
 * @param {any} factory 模块的内容
 * @returns 返回定义的模块
 */
function define(name, dependencies, factory) {
	if (dependencies === undefined) {
		dependencies = name
		name = require.currentScript()
	}
	if (factory === undefined) {
		factory = dependencies
		if (typeof name === "string") {
			dependencies = ["require", "exports", "module"]
		} else {
			dependencies = name
			name = require.currentScript()
		}
	}
	const url = require.resolve(name)
	const module = require.cache[url] ||= { state: 1 /* fetching */ }
	if (module.state < 2 /* fetched */) {
		module.state = 2 /* fetched */
		module.dependencies = dependencies
		if (typeof factory === "function") {
			module.exports = {}
			module.define = factory
		} else {
			module.exports = factory
		}
	}
	return module
}

/** 判断当前 define 是否实现 AMD 规范 */
define.amd = true