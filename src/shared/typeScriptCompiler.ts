import * as ts from "typescript"

/** 表示一个增量 TypeScript 编译器 */
export class TypeScriptCompiler {

	/** 获取基路径 */
	readonly baseDir: string

	/** 获取在每个文件夹读取的配置文件名，默认为 [`tsconfig.json`, `jsconfig.json`] */
	readonly configFileNames?: string[]

	/** 获取已读取的配置文件路径 */
	readonly configFilePaths = new Set<string>()

	/** 获取全局默认的编译器选项 */
	readonly compilerOptions: ts.CompilerOptions

	/** 获取使用的 TypeScript 编译器宿主对象 */
	readonly compilerHost: ts.CompilerHost

	/** 获取自定义的插件 */
	plugins?: TypeScriptCompilerPlugin[]

	/** 获取自定义模块重命名函数 */
	renameModuleName?: TypeScriptCompilerOptions["renameModuleName"]

	/**
	 * 初始化新的编译器
	 * @param options 附加选项
	 */
	constructor(options: TypeScriptCompilerOptions = {}) {
		const baseDir = this.baseDir = options.baseDir ?? ts.sys.getCurrentDirectory()
		let compilerOptions = normalizeCompilerOptions(options.compilerOptions ?? {}, baseDir)
		if (typeof options.configFile === "string") {
			compilerOptions = Object.assign(readTSConfig(ts.getNormalizedAbsolutePath(options.configFile, baseDir), this.configFilePaths), compilerOptions)
		} else {
			this.configFileNames = options.configFile === undefined ? [`tsconfig.json`, `jsconfig.json`] : options.configFile
		}
		compilerOptions.allowJs ??= true
		compilerOptions.allowNonTsExtensions ??= true
		compilerOptions.suppressOutputPathCheck = true
		delete compilerOptions.outDir
		delete compilerOptions.outFile
		this.compilerOptions = compilerOptions
		const newLine = ts.getNewLineCharacter(compilerOptions)
		const getSourceFile: ts.CompilerHost["getSourceFile"] = (fileName, languageVersion, onError?, shouldCreateNewSourceFile?) => this.compilerHost.getSourceFileByPath(fileName, this.toPath(fileName), languageVersion, onError, shouldCreateNewSourceFile)
		const getSourceFileByPath: ts.CompilerHost["getSourceFileByPath"] = (fileName, path, languageVersion, onError?, shouldCreateNewSourceFile?) => {
			const cache = this._fileCaches.get(path)
			if (cache === undefined) {
				const content = ts.sys.readFile(path)
				if (content === undefined) {
					return undefined
				}
				const sourceFile = ts.createSourceFile(fileName, content, languageVersion)
				this._fileCaches.set(path, {
					sourceFile: sourceFile
				})
				return sourceFile
			}
			if (shouldCreateNewSourceFile) {
				cache.sourceFile = undefined
			}
			const cachedSourceFile = cache.sourceFile
			if (cachedSourceFile && !cache.updated) {
				return cachedSourceFile
			}
			let content = cache.content
			if (content === undefined) {
				content = ts.sys.readFile(path)
				if (content === undefined) {
					this._fileCaches.delete(path)
					onError(`File Not Fould: ${path}`)
					return undefined
				}
			} else {
				cache.content = undefined
			}
			cache.updated = false
			if (cachedSourceFile) {
				const changeRange = getTextChangeRange(cachedSourceFile.text, content)
				if (changeRange) {
					return cache.sourceFile = ts.updateSourceFile(cachedSourceFile, content, changeRange)
				}
				return cachedSourceFile
			}
			return cache.sourceFile = ts.createSourceFile(fileName, content, languageVersion)
		}
		if (options.transpileOnly) {
			compilerOptions.noResolve = compilerOptions.skipLibCheck = compilerOptions.skipDefaultLibCheck = compilerOptions.noLib = true
			this.compilerHost = {
				getSourceFile,
				getSourceFileByPath,
				getDefaultLibFileName() { return "lib.d.ts" },
				writeFile: () => { },
				getCurrentDirectory: () => "",
				useCaseSensitiveFileNames: () => false,
				getCanonicalFileName: fileName => fileName,
				getNewLine() { return newLine },
				fileExists: (fileName: string) => false,
				readFile: () => undefined,
				trace() { },
				directoryExists: () => true,
				getEnvironmentVariable: () => undefined,
				getDirectories: () => [],
				realpath: fileName => fileName,
				readDirectory: () => [],
				createHash: () => undefined,
				...options.compilerHost
			}
		} else {
			this.compilerHost = {
				getSourceFile,
				getSourceFileByPath,
				getDefaultLibLocation() {
					return ts.getDirectoryPath(ts.normalizePath(ts.sys.getExecutingFilePath()))
				},
				getDefaultLibFileName(options) { return ts.combinePaths(this.getDefaultLibLocation(), ts.getDefaultLibFileName(options)) },
				writeFile: ts.sys.writeFile,
				getCurrentDirectory: () => baseDir,
				useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
				getCanonicalFileName: ts.createGetCanonicalFileName(compilerOptions.forceConsistentCasingInFileNames),
				getNewLine() { return newLine },
				fileExists: ts.sys.fileExists,
				readFile: ts.sys.readFile,
				trace() { },
				directoryExists: ts.sys.directoryExists,
				getEnvironmentVariable: ts.sys.getEnvironmentVariable,
				getDirectories: ts.sys.getDirectories,
				realpath: ts.sys.realpath,
				readDirectory: ts.sys.readDirectory,
				createHash: ts.sys.createHash,
				...options.compilerHost
			}
		}
		this.renameModuleName = options.renameModuleName
		if (compilerOptions.locale) {
			ts.validateLocaleAndSetLanguage(compilerOptions.locale, ts.sys)
		}
		if (options.getCustomTransformers) {
			this.use({
				factory: options.getCustomTransformers
			})
		}
		if (options.plugins) {
			for (const plugin of options.plugins) {
				this.use(plugin)
			}
		}
	}

	/**
	 * 载入指定的插件
	 * @param plugin 要载入的插件
	 */
	use(plugin: TypeScriptCompilerPlugin) {
		if (plugin.transform) {
			const module = require(plugin.transform)
			const factory = plugin.import ? module[plugin.import] : module
			if (typeof factory !== "function") {
				throw new Error(`plugins: "${plugin.transform}" export "${plugin.import || "default"}" is not a plugin: "${require("util").inspect(factory)}"`)
			}
			let newFactory: typeof factory
			switch (plugin.type) {
				case undefined:
				case "program":
					if (factory.length <= 1) {
						newFactory = factory
					} else {
						newFactory = (program: ts.Program & { customTransformerDiagnostics: ts.Diagnostic[] }) => factory(program, plugin, {
							ts,
							addDiagnostic(diagnostic: ts.Diagnostic) {
								if (!program.customTransformerDiagnostics) program.customTransformerDiagnostics = []
								program.customTransformerDiagnostics.push(diagnostic)
							}
						})
					}
					break
				case "config":
					newFactory = factory(plugin)
					break
				case "compilerOptions":
					newFactory = (program: ts.Program) => factory(program.getCompilerOptions(), plugin)
					break
				case "checker":
					newFactory = (program: ts.Program) => factory(program.getTypeChecker(), plugin)
					break
				case "raw":
					newFactory = (program: ts.Program) => (ctx: ts.TransformationContext) => factory(ctx, program, plugin)
					break
				default:
					throw new Error(`Unsupported ts plugin: ${plugin.transform}`)
			}
			plugin = {
				...plugin,
				factory: newFactory
			}
		}
		this.plugins ??= []
		this.plugins.push(plugin)
	}

	/**
	 * 编译一段 TypeScript 代码到 JavaScript
	 * @param content 要编译的源码，如果未指定则根据路径读取
	 * @param fileName 源码的路径，用于查找和该路径相关的配置以及解析源码中导入的相对路径，要编译 JSX，文件名必须以 `x` 结尾
	 * @param checkErrors 是否检查错误，如果为 `transpileOnly` 则只检查语法错误，忽略类型错误
	 * @param moduleName 如果要生成 AMD 模块，则指定当前模块名
	 * @param renameModuleName 重命名导入模块名的回调函数
	 * @param options 针对当前文件的编译器选项
	 */
	compile(content: string | undefined, fileName?: string, checkErrors: false | true | "transpileOnly" = "transpileOnly", moduleName?: string, renameModuleName = this.renameModuleName, options?: TypeScriptCompilerOptions["compilerOptions"]) {
		const result = {
			content: ""
		} as TypeScriptCompileResult
		const inputFileName = fileName ?? `<input>.tsx`
		const program = result.program = this.createProgram(inputFileName, content, options)
		const sourceFile = result.sourceFile = program.getSourceFile(inputFileName)
		if (moduleName) {
			sourceFile.moduleName = moduleName
		}
		if (renameModuleName) {
			sourceFile.renamedDependencies = new Map() as any
			sourceFile.renamedDependencies.get = moduleName => renameModuleName(moduleName, sourceFile, program)
		}
		const emitResult = program.emit(sourceFile, (path: string, content: string) => {
			if (ts.fileExtensionIs(path, ".d.ts")) {
				result.declaration = content
			} else if (ts.fileExtensionIs(path, ".map")) {
				result.sourceMap = content
			} else {
				result.content = content
			}
		}, undefined, undefined, this.getCustomTransformers(program))
		if (checkErrors) {
			const errors = result.errors = program.getSyntacticDiagnostics(sourceFile).slice(0) as ts.Diagnostic[]
			if (checkErrors === true) {
				errors.push(...program.getSemanticDiagnostics(sourceFile))
			}
			errors.push(...emitResult.diagnostics)
			if ((program as any).customTransformerDiagnostics) {
				errors.push(...(program as any).customTransformerDiagnostics)
			}
		}
		if (fileName === undefined) {
			this._fileCaches.delete(inputFileName)
		}
		return result
	}

	/** 所有已解析的文件 */
	private readonly _fileCaches = new Map<string, {
		/** 已解析的文件对象 */
		sourceFile?: ts.SourceFile
		/** 标记文件是否被更新 */
		updated?: boolean
		/** 文件的内容，如果文件已更新则为更新后的内容 */
		content?: string
	}>()

	/** 内部使用的编译对象 */
	private _program?: ts.Program

	/**
	 * 创建用于编译指定文件的工程对象
	 * @param fileName 文件的路径，如果路径为空，则文件内容必须不能为空
	 * @param content 文件的内容，如果未指定则根据路径读取
	 * @param options 针对当前文件的编译器选项
	 */
	createProgram(fileName: string, content?: string, options?: TypeScriptCompilerOptions["compilerOptions"]) {
		const compilerOptions = { ...this.getCompilerOptions(this.toPath(fileName)) }
		if (options) {
			Object.assign(compilerOptions, normalizeCompilerOptions(options, this.baseDir))
		}
		if (fileName.endsWith("x")) {
			compilerOptions.jsx ??= ts.JsxEmit.React
		}
		if (content !== undefined) {
			const key = this.toPath(fileName)
			const cache = this._fileCaches.get(key)
			if (cache) {
				cache.updated = true
				cache.content = content
			} else {
				this._fileCaches.set(key, { content })
			}
		}
		const program = this._program = ts.createProgram([fileName], compilerOptions, this.compilerHost, this._program)
		if (compilerOptions.sourceRoot === "file:///") {
			compilerOptions.sourceRoot += program.getCommonSourceDirectory()
		}
		return program
	}

	/**
	 * 返回内部使用的完整绝对路径
	 * @param fileName 原始文件名
	 */
	toPath(fileName: string) {
		return ts.toPath(fileName, this.baseDir, this.compilerHost.getCanonicalFileName)
	}

	/** 获取不同文件夹的配置对象 */
	private readonly _compilerOptionsCache = new Map<string, ts.CompilerOptions>()

	/**
	 * 获取指定路径对应的编译器选项
	 * @param path 要查找的路径
	 */
	getCompilerOptions(path: string) {
		if (this.configFileNames) {
			while (true) {
				const dir = ts.getDirectoryPath(path)
				if (dir.length === path.length) {
					break
				}
				const cache = this._compilerOptionsCache.get(dir)
				if (cache) {
					return cache
				}
				for (const configFileName of this.configFileNames) {
					const configFilePath = ts.combinePaths(dir, configFileName)
					const options = readTSConfig(configFilePath, this.configFilePaths)
					if (options) {
						const result = Object.assign(options, this.compilerOptions)
						result.allowJs ??= true
						result.allowNonTsExtensions ??= true
						result.suppressOutputPathCheck = true
						delete result.outDir
						delete result.outFile
						this._compilerOptionsCache.set(dir, result)
						return result
					}
				}
				path = dir
			}
		}
		return this.compilerOptions
	}

	/**
	 * 获取自定义转换器，如果转换器为空则返回 `undefined`
	 * @param program 当前要转换的程序
	 */
	getCustomTransformers(program: ts.Program) {
		if (this.plugins) {
			const customeTransformers: ts.CustomTransformers = {}
			for (const customeTransformer of this.plugins) {
				const transformer = customeTransformer.factory(program, this)
				if (typeof transformer === "function") {
					const key = customeTransformer.afterDeclarations ? "afterDeclarations" : customeTransformer.after ? "after" : "before"
					const array = customeTransformers[key] || (customeTransformers[key] = [])
					array.push(transformer)
				} else {
					for (const key of ["before", "after", "afterDeclarations"]) {
						if (transformer[key]) {
							const array = customeTransformers[key] || (customeTransformers[key] = [])
							if (Array.isArray(transformer[key])) {
								array.push(...transformer[key])
							} else {
								array.push(transformer[key])
							}
						}
					}
				}
			}
			return customeTransformers
		}
	}

	/**
	 * 通知指定的文件已更新
	 * @param path 修改的文件绝对路径
	 */
	emitUpdate(path: string) {
		path = this.compilerHost.getCanonicalFileName(ts.normalizePath(path))
		if (this.configFilePaths.has(path)) {
			this._compilerOptionsCache.clear()
			this._fileCaches.clear()
			return
		}
		const cache = this._fileCaches.get(path)
		if (cache) {
			cache.updated = true
		}
	}

	/**
	 * 格式化诊断信息
	 * @param errors 要格式化的对象
	 */
	formatErrors(errors: readonly ts.Diagnostic[]) {
		return ts.formatDiagnostics(errors, this.compilerHost)
	}

	/**
	 * 获取指定路径对应的源文件对象
	 * @param fileName 文件的路径
	 */
	getSourceFile(fileName: string) {
		return this._program?.getSourceFile(this.toPath(fileName)) ?? this.createProgram(fileName).getSourceFile(fileName)
	}

	/** 获取上一次编译时创建的工程对象 */
	getCurrentProgram() {
		return this._program
	}

	/**
	 * 使用内置的解析规则解析模块
	 * @param moduleName 要解析的模块名
	 * @param containingFile 所在的文件
	 * @param redirectedReference 重定向的引用
	 */
	resolveModuleName(moduleName: string, containingFile: string, redirectedReference?: ts.ResolvedProjectReference) {
		const options = this._program?.getCompilerOptions() ?? this.compilerOptions
		return ts.resolveModuleName(moduleName, containingFile, options, this.compilerHost, undefined, redirectedReference)
	}

	/**
	 * 使用内置的解析规则解析 JS 模块
	 * @param moduleName 要解析的模块名
	 * @param containingFile 所在的文件
	 */
	resolveJSModuleName(moduleName: string, containingFile: string) {
		return ts.tryResolveJSModule(moduleName, containingFile, this.compilerHost)?.resolvedFileName
	}

}

/** 表示 TypeScript 编译器的附加选项 */
export interface TypeScriptCompilerOptions {
	/** 要使用的基路径，将用于查找配置以及依赖的模块 */
	baseDir?: string
	/**
	 * 要读取的 `tsconfig.json` 路径
	 * - 字符串：指定要加载的配置文件绝对路径
	 * - 数组：指定要加载的配置文件名，将从当前文件夹开始向上搜素同名文件
	 * @default ["tsconfig.json", "jsconfig.json"]
	 */
	configFile?: string | string[]
	/** 编译器的选项，这里设置的选项会覆盖 `tsconfig.json` 中的同名配置 */
	compilerOptions?: Merge<ts.CompilerOptions, {
		target?: "es3" | "es5" | "es6" | "es2015" | "es2016" | "es2017" | "es2018" | "es2019" | "es2020" | "es2021" | "es2022" | "esnext" | string
		module?: "none" | "commonjs" | "amd" | "system" | "umd" | "es6" | "es2015" | "esnext"
		jsx?: "none" | "preserve" | "react-native" | "react" | "react-native" | "react-jsx"
		moduleResolution?: "node" | "classic"
		newLine?: "CRLF" | "LF"
	}>
	/** 自定义编译器宿主对象 */
	compilerHost?: Partial<ts.CompilerHost>
	/**
	 * 是否仅转换代码但不进行类型检查，启用后将可以大幅提升编译性能
	 * @default false
	 */
	transpileOnly?: boolean
	/** 自定义重命名模块名的逻辑 */
	renameModuleName?: (moduleName: string, sourceFile: ts.SourceFile, program: ts.Program) => string | null
	/** 获取自定义转换器 */
	getCustomTransformers?: (program: ts.Program, compiler: TypeScriptCompiler) => ts.CustomTransformers
	/** 自定义转换器插件 */
	plugins?: TypeScriptCompilerPlugin[]
}

/** 表示一个 TypeScript 插件 */
export interface TypeScriptCompilerPlugin {
	[option: string]: any
	/** 返回转换器的工厂函数 */
	factory?: (program: ts.Program, compiler: this) => ts.CustomTransformers["before"] | ts.CustomTransformers
	/** 插件模块名 */
	transform?: string
	/** 从插件模块中导入的名称 */
	import?: string
	/** 从插件模块中导入的类型 */
	type?: "program" | "raw" | "config" | "checker" | "compilerOptions"
	/** 是否应该在内置 JS 转换器之后执行转换器 */
	after?: boolean
	/** 是否应该在生成 .d.ts 文件之后执行转换器 */
	afterDeclarations?: boolean
}

/** 合并类型定义 */
type Merge<T, U> = { [key in keyof T]: key extends keyof U ? T[key] | U[key] : T[key] } & { [key in keyof U]: key extends keyof T ? T[key] | U[key] : U[key] }

/** 表示 TypeScript 编译结果 */
export interface TypeScriptCompileResult {
	/** 生成的 JavaScript 代码 */
	content: string
	/** 生成的源映射的内容 */
	sourceMap?: string
	/** 生成的声明文件内容 */
	declaration?: string
	/** 生成时累积的错误 */
	errors?: ts.Diagnostic[]
	/** 当前文件的源文件对象 */
	sourceFile: ts.SourceFile
	/** 本次使用的编译对象 */
	program: ts.Program
}

/**
 * 读取指定的 `tsconfig.json`，如果配置文件不存在则返回 `undefined`
 * @param path 要读取的配置
 * @param configFilePaths 如果传递了空集合，则返回所有已读取的文件路径
 */
export function readTSConfig(path: string, configFilePaths?: Set<string>) {
	const parseConfigHost: ts.ParseConfigHost = {
		fileExists() { return false },
		readFile(fileName) {
			if (configFilePaths) {
				configFilePaths.add(fileName)
			}
			return ts.sys.readFile(fileName)
		},
		readDirectory() { return [`&.ts`] },
		useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames
	}
	const configFile = ts.readConfigFile(path, parseConfigHost.readFile)
	if (configFile.error?.code === 5083) {
		return undefined
	}
	const basePath = ts.getDirectoryPath(path)
	const commandLine = ts.parseJsonConfigFileContent(configFile.config, parseConfigHost, basePath)
	return commandLine.options
}

/**
 * 规范化 TypeScript 编译器选项对象
 * @param options 用户设置的选项
 * @param baseDir 解析相对地址的基路径
 * @see ts.convertCompilerOptionsFromJson
 */
export function normalizeCompilerOptions(options: TypeScriptCompilerOptions["compilerOptions"], baseDir: string) {
	const compilerOptions: ts.CompilerOptions = {}
	for (const optionDeclaration of ts.optionDeclarations) {
		if (optionDeclaration.name in options) {
			const value = convertOption(options[optionDeclaration.name], optionDeclaration)
			if (value != undefined) {
				compilerOptions[optionDeclaration.name] = value
			}
		}
	}
	return compilerOptions

	function convertOption(value: any, optionDeclaration: (typeof ts.optionDeclarations)[0]) {
		if (value == undefined) {
			return undefined
		}
		if (optionDeclaration.type === "string") {
			if (typeof value !== "string") {
				value = String(value)
			}
			if (optionDeclaration.isFilePath) {
				return ts.getNormalizedAbsolutePath(value, baseDir) || "."
			}
			return typeof value === "string" ? value : String(value)
		}
		if (optionDeclaration.type === "list") {
			return Array.isArray(value) ? value.map(item => convertOption(item, optionDeclaration.element)).filter(item => item != undefined) : undefined
		}
		if (typeof optionDeclaration.type === "string") {
			return typeof value === optionDeclaration.type ? value : undefined
		}
		return optionDeclaration.type.get(value) ?? (new Set(optionDeclaration.type.values() as any).has(value) ? value : undefined)
	}
}

/** 比较文本的差异 */
function getTextChangeRange(oldText: string, newText: string): ts.TextChangeRange | undefined {
	let left = 0
	let right = newText.length
	while (left < right && oldText.charCodeAt(left) === newText.charCodeAt(left)) {
		left++
	}
	if (left === right && oldText.length === newText.length) {
		return
	}
	let oldRight = oldText.length
	while (left < right && left < oldRight && oldText.charCodeAt(--oldRight) === newText.charCodeAt(--right)) { }
	return {
		span: {
			start: left,
			length: oldRight - left + 1
		},
		newLength: right - left + 1
	}
}

declare module "typescript" {
	function getNormalizedAbsolutePath(path: string, baseDir: string): string
	function getDirectoryPath(path: string): string
	function getNewLineCharacter(compilerOptions: CompilerOptions): string
	function combinePaths(...paths: string[]): string
	function createGetCanonicalFileName(forceConsistentCasingInFileNames: boolean): (s: string) => string
	function fileExtensionIs(path: string, ext: string): boolean
	function toPath(fileName: string, cwd: string, getCanonicalFileName: ReturnType<typeof createGetCanonicalFileName>): Path
	function tryResolveJSModule(moduleName: string, initialDir: string, host: CompilerHost): ResolvedModule | null
	var optionDeclarations: { name: string, type: string | ESMap<string, number>, element?: (typeof optionDeclarations)[0], isFilePath?: boolean }[]
	function normalizePath(path: string): Path
	interface System {
		getEnvironmentVariable(name: string): string | undefined
	}
	interface SourceFile {
		imports: Token<SyntaxKind.StringLiteral>[]
		renamedDependencies?: ESMap<string, string>
	}
	interface Program {
		getCommonSourceDirectory(): string
	}
}