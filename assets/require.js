/**
 * @fileoverview require.js - A light-weight AMD loader
 * @version 4.0.0
 * @author xuld <xuld@xuld.net>
 * @license MIT
 */

/**
 * 加载指定的模块及其依赖，如果模块已加载则直接返回
 * @param {string | string[]} name 要加载的模块名
 * @param {Function} [onLoad] 模块加载成功后的回调函数，参数为模块的导出对象
 * @param {Function} [onError] 模块加载失败后的回调函数，参数为错误对象
 * @param {string} [baseURL] 解析模块地址时使用的基地址
 * @returns 如果模块已加载，则返回模块的导出项
 */
 function require(name, onLoad, onError, baseURL) {
	const dependencies = typeof name === "string" ? [name] : name.slice(0)
	const entryModule = {
		state: 2 /* fetched */,
		dependencies,
		resolvedDependencies: [],
		exports: {},
		define: onLoad,
		onError: onError
	}
	let mainModule = require.main
	if (mainModule) {
		while (mainModule.next) {
			mainModule = mainModule.next
		}
		mainModule.next = entryModule
	} else {
		require.main = entryModule
	}
	require._ensure(entryModule, baseURL)
	return entryModule.state < 4 /* executed */ ? undefined : typeof name === "string" ? dependencies[0] : dependencies
}

/** 获取所有已加载的模块 */
require.cache = { __proto__: null }

/** 获取正在等待加载的模块数 */
require._pending = 0

/** 确保指定模块及其依赖都已加载 */
require._ensure = (module, moduleURL) => {
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
				case "module":
					dependencyModule = { state: 4 /* executed */, exports: module }
					break
				case "require":
					dependencyModule = { state: 4 /* executed */, exports: (name, callback, onError) => require(name, callback, onError, moduleURL) }
					break
				default:
					require._pending++
					const dependencyURL = require.resolve(dependencyName, moduleURL)
					module.resolvedDependencies.push(dependencyURL)
					if (dependencyModule = require.cache[dependencyURL]) {
						require._ensure(dependencyModule, dependencyURL)
						require._pending--
					} else {
						require.cache[dependencyURL] = dependencyModule = { state: 1 /* fetching */ }
						require.getLoader(dependencyURL)(dependencyURL, () => {
							require._ensure(dependencyModule, dependencyURL)
							if (!--require._pending) {
								require._ready()
							}
						}, () => {
							// 删除缓存以便稍后重新加载
							delete require.cache[dependencyURL]
							dependencyModule.state = 5 /* error */
							dependencyModule.error = new Error(`Cannot load module '${dependencyName}' (from '${moduleURL ?? require.currentScript()}')`)
							dependencyModule.error.fileName = dependencyURL
							if (!--require._pending) {
								require._ready()
							}
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

/** 当所有模块加载完成后执行 */
require._ready = () => {
	const mainModule = require.main
	if (mainModule) {
		try {
			require._execute(mainModule)
		} finally {
			require.main = mainModule.next
			mainModule.next = undefined
			if (!require._pending) {
				require._ready()
			}
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
			require._execute(dependency)
			if (dependency.state === 5 /* error */) {
				module.state = 5 /* error */
				module.error = dependency.error
			}
			dependencies[i] = dependency.exports
		}
		module.dependencies = undefined
	}
	if (module.state === 5 /* error */) {
		if (module.onError) {
			module.onError(module.error)
			module.onError = undefined
		} else if (module === require.main) {
			throw module.error
		}
	} else {
		const define = module.define
		if (define) {
			const exports = dependencies ? define(...dependencies) : define()
			if (exports !== undefined) {
				module.exports = exports
			}
			module.define = undefined
		}
	}
}

/** 解析路径别名 */
require.paths = { __proto__: null }

/**
 * 解析指定模块名的绝对地址
 * @param {string} name 要解析的模块名
 * @param {string} [baseURL] 解析使用的基地址
 */
require.resolve = (name, baseURL) => {
	if (/^\.\.?(\/|$)/.test(name)) {
		baseURL ??= require.currentScript()
	} else {
		const alias = require.paths[name]
		if (alias === undefined) {
			for (const key in require.paths) {
				if (key.endsWith("/") && name.startsWith(key)) {
					name = require.paths[key] + name.slice(key.length)
					break
				}
			}
		} else {
			name = alias
		}
		baseURL = require.baseUrl
	}
	name = new URL(name, baseURL).toString()
	if (!require.getLoader(name)) {
		name += ".js"
	}
	return name
}

/** 获取当前正在执行的脚本的绝对路径 */
require.currentScript = () => {
	const script = document.currentScript
	return script && script.src || location.href
}

/** 获取或设置内置模块的基路径 */
require.baseUrl = require.currentScript()

/** 获取或设置请求模块时在地址后追加的参数 */
require.urlArgs = ""

/**
 * 获取指定地址的加载器
 * @param {string} url 要加载的地址
 */
require.getLoader = url => {
	const match = /\.[^\.\/\\]+$/.exec(url)
	return match && require.extensions[match[0].toLowerCase()]
}

/** 获取不同扩展名的载入方式 */
require.extensions = {
	".js"(url, onLoad, onError) {
		const script = document.createElement("script")
		script.async = true
		script.onload = onLoad
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
			link.onerror = onError
		} else {
			setTimeout(onLoad, 30)
		}
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
".webp.png.ico.jxl.jpg.gif.bmp.jpeg.cur.woff2.woff.ttf.eot.amr.mp3.wav.webm.mp4.ogg".replace(/\.\w+/g, ext => {
	require.extensions[ext] = require.extensions[".svg"]
})

/** 获取指定类型的最后一个节点 */
require._lastNode = tagName => {
	const nodes = document.getElementsByTagName(tagName)
	return nodes[nodes.length - 1]
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
		module.resolvedDependencies = []
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