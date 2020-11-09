import * as ts from "typescript";
/** 表示一个增量 TypeScript 编译器 */
export class TypeScriptCompiler {
    /**
     * 初始化新的编译器
     * @param options 附加选项
     */
    constructor(options = {}) {
        var _a, _b, _c, _d;
        /** 获取已读取的配置文件路径 */
        this.configFilePaths = new Set();
        /** 所有已解析的文件 */
        this._fileCaches = new Map();
        /** 获取不同文件夹的配置对象 */
        this._compilerOptionsCache = new Map();
        const baseDir = this.baseDir = (_a = options.baseDir) !== null && _a !== void 0 ? _a : ts.sys.getCurrentDirectory();
        let compilerOptions = normalizeCompilerOptions((_b = options.compilerOptions) !== null && _b !== void 0 ? _b : {}, baseDir);
        if (typeof options.configFile === "string") {
            compilerOptions = Object.assign(readTSConfig(ts.getNormalizedAbsolutePath(options.configFile, baseDir), this.configFilePaths), compilerOptions);
        }
        else {
            this.configFileNames = options.configFile === undefined ? [`tsconfig.json`, `jsconfig.json`] : options.configFile;
        }
        (_c = compilerOptions.allowJs) !== null && _c !== void 0 ? _c : (compilerOptions.allowJs = true);
        (_d = compilerOptions.allowNonTsExtensions) !== null && _d !== void 0 ? _d : (compilerOptions.allowNonTsExtensions = true);
        compilerOptions.suppressOutputPathCheck = true;
        delete compilerOptions.outDir;
        delete compilerOptions.outFile;
        this.compilerOptions = compilerOptions;
        const newLine = ts.getNewLineCharacter(compilerOptions);
        const getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => this.compilerHost.getSourceFileByPath(fileName, this.toPath(fileName), languageVersion, onError, shouldCreateNewSourceFile);
        const getSourceFileByPath = (fileName, path, languageVersion, onError, shouldCreateNewSourceFile) => {
            const cache = this._fileCaches.get(path);
            if (cache === undefined) {
                const content = ts.sys.readFile(path);
                if (content === undefined) {
                    return undefined;
                }
                const sourceFile = ts.createSourceFile(fileName, content, languageVersion);
                this._fileCaches.set(path, {
                    sourceFile: sourceFile
                });
                return sourceFile;
            }
            if (shouldCreateNewSourceFile) {
                cache.sourceFile = undefined;
            }
            const cachedSourceFile = cache.sourceFile;
            if (cachedSourceFile && !cache.updated) {
                return cachedSourceFile;
            }
            let content = cache.content;
            if (content === undefined) {
                content = ts.sys.readFile(path);
                if (content === undefined) {
                    this._fileCaches.delete(path);
                    onError(`File Not Fould: ${path}`);
                    return undefined;
                }
            }
            else {
                cache.content = undefined;
            }
            cache.updated = false;
            if (cachedSourceFile) {
                const changeRange = getTextChangeRange(cachedSourceFile.text, content);
                if (changeRange) {
                    return cache.sourceFile = ts.updateSourceFile(cachedSourceFile, content, changeRange);
                }
                return cachedSourceFile;
            }
            return cache.sourceFile = ts.createSourceFile(fileName, content, languageVersion);
        };
        if (options.transpileOnly) {
            compilerOptions.noResolve = compilerOptions.skipLibCheck = compilerOptions.skipDefaultLibCheck = compilerOptions.noLib = true;
            this.compilerHost = {
                getSourceFile,
                getSourceFileByPath,
                getDefaultLibFileName() { return "lib.d.ts"; },
                writeFile: () => { },
                getCurrentDirectory: () => "",
                useCaseSensitiveFileNames: () => false,
                getCanonicalFileName: fileName => fileName,
                getNewLine() { return newLine; },
                fileExists: (fileName) => false,
                readFile: () => undefined,
                trace() { },
                directoryExists: () => true,
                getEnvironmentVariable: () => undefined,
                getDirectories: () => [],
                realpath: fileName => fileName,
                readDirectory: () => [],
                createHash: () => undefined,
                ...options.compilerHost
            };
        }
        else {
            this.compilerHost = {
                getSourceFile,
                getSourceFileByPath,
                getDefaultLibLocation() {
                    return ts.getDirectoryPath(ts.normalizePath(ts.sys.getExecutingFilePath()));
                },
                getDefaultLibFileName(options) { return ts.combinePaths(this.getDefaultLibLocation(), ts.getDefaultLibFileName(options)); },
                writeFile: ts.sys.writeFile,
                getCurrentDirectory: () => baseDir,
                useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
                getCanonicalFileName: ts.createGetCanonicalFileName(compilerOptions.forceConsistentCasingInFileNames),
                getNewLine() { return newLine; },
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
            };
        }
        this.renameModuleName = options.renameModuleName;
        if (compilerOptions.locale) {
            ts.validateLocaleAndSetLanguage(compilerOptions.locale, ts.sys);
        }
        if (options.getCustomTransformers) {
            this.use({
                factory: options.getCustomTransformers
            });
        }
        if (options.plugins) {
            for (const plugin of options.plugins) {
                this.use(plugin);
            }
        }
    }
    /**
     * 载入指定的插件
     * @param plugin 要载入的插件
     */
    use(plugin) {
        var _a;
        if (plugin.transform) {
            const module = require(plugin.transform);
            const factory = plugin.import ? module[plugin.import] : module;
            if (typeof factory !== "function") {
                throw new Error(`plugins: "${plugin.transform}" export "${plugin.import || "default"}" is not a plugin: "${require("util").inspect(factory)}"`);
            }
            let newFactory;
            switch (plugin.type) {
                case undefined:
                case "program":
                    if (factory.length <= 1) {
                        newFactory = factory;
                    }
                    else {
                        newFactory = (program) => factory(program, plugin, {
                            ts,
                            addDiagnostic(diagnostic) {
                                if (!program.customTransformerDiagnostics)
                                    program.customTransformerDiagnostics = [];
                                program.customTransformerDiagnostics.push(diagnostic);
                            }
                        });
                    }
                    break;
                case "config":
                    newFactory = factory(plugin);
                    break;
                case "compilerOptions":
                    newFactory = (program) => factory(program.getCompilerOptions(), plugin);
                    break;
                case "checker":
                    newFactory = (program) => factory(program.getTypeChecker(), plugin);
                    break;
                case "raw":
                    newFactory = (program) => (ctx) => factory(ctx, program, plugin);
                    break;
                default:
                    throw new Error(`Unsupported ts plugin: ${plugin.transform}`);
            }
            plugin = {
                ...plugin,
                factory: newFactory
            };
        }
        (_a = this.plugins) !== null && _a !== void 0 ? _a : (this.plugins = []);
        this.plugins.push(plugin);
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
    compile(content, fileName, checkErrors = "transpileOnly", moduleName, renameModuleName = this.renameModuleName, options) {
        const result = {
            content: ""
        };
        const inputFileName = fileName !== null && fileName !== void 0 ? fileName : `<input>.tsx`;
        const program = result.program = this.createProgram(inputFileName, content, options);
        const sourceFile = result.sourceFile = program.getSourceFile(inputFileName);
        if (moduleName) {
            sourceFile.moduleName = moduleName;
        }
        if (renameModuleName) {
            sourceFile.renamedDependencies = new Map();
            sourceFile.renamedDependencies.get = moduleName => renameModuleName(moduleName, sourceFile, program);
        }
        const emitResult = program.emit(sourceFile, (path, content) => {
            if (ts.fileExtensionIs(path, ".d.ts")) {
                result.declaration = content;
            }
            else if (ts.fileExtensionIs(path, ".map")) {
                result.sourceMap = content;
            }
            else {
                result.content = content;
            }
        }, undefined, undefined, this.getCustomTransformers(program));
        if (checkErrors) {
            const errors = result.errors = program.getSyntacticDiagnostics(sourceFile).slice(0);
            if (checkErrors === true) {
                errors.push(...program.getSemanticDiagnostics(sourceFile));
            }
            errors.push(...emitResult.diagnostics);
            if (program.customTransformerDiagnostics) {
                errors.push(...program.customTransformerDiagnostics);
            }
        }
        if (fileName === undefined) {
            this._fileCaches.delete(inputFileName);
        }
        return result;
    }
    /**
     * 创建用于编译指定文件的工程对象
     * @param fileName 文件的路径，如果路径为空，则文件内容必须不能为空
     * @param content 文件的内容，如果未指定则根据路径读取
     * @param options 针对当前文件的编译器选项
     */
    createProgram(fileName, content, options) {
        var _a;
        const compilerOptions = { ...this.getCompilerOptions(this.toPath(fileName)) };
        if (options) {
            Object.assign(compilerOptions, normalizeCompilerOptions(options, this.baseDir));
        }
        if (fileName.endsWith("x")) {
            (_a = compilerOptions.jsx) !== null && _a !== void 0 ? _a : (compilerOptions.jsx = ts.JsxEmit.React);
        }
        if (content !== undefined) {
            const key = this.toPath(fileName);
            const cache = this._fileCaches.get(key);
            if (cache) {
                cache.updated = true;
                cache.content = content;
            }
            else {
                this._fileCaches.set(key, { content });
            }
        }
        const program = this._program = ts.createProgram([fileName], compilerOptions, this.compilerHost, this._program);
        if (compilerOptions.sourceRoot === "file:///") {
            compilerOptions.sourceRoot += program.getCommonSourceDirectory();
        }
        return program;
    }
    /**
     * 返回内部使用的完整绝对路径
     * @param fileName 原始文件名
     */
    toPath(fileName) {
        return ts.toPath(fileName, this.baseDir, this.compilerHost.getCanonicalFileName);
    }
    /**
     * 获取指定路径对应的编译器选项
     * @param path 要查找的路径
     */
    getCompilerOptions(path) {
        if (this.configFileNames) {
            while (true) {
                const dir = ts.getDirectoryPath(path);
                if (dir.length === path.length) {
                    break;
                }
                const cache = this._compilerOptionsCache.get(dir);
                if (cache) {
                    return cache;
                }
                for (const configFileName of this.configFileNames) {
                    const configFilePath = ts.combinePaths(dir, configFileName);
                    const options = readTSConfig(configFilePath, this.configFilePaths);
                    if (options) {
                        const result = Object.assign(options, this.compilerOptions);
                        this._compilerOptionsCache.set(dir, result);
                        return result;
                    }
                }
                path = dir;
            }
        }
        return this.compilerOptions;
    }
    /**
     * 获取自定义转换器，如果转换器为空则返回 `undefined`
     * @param program 当前要转换的程序
     */
    getCustomTransformers(program) {
        if (this.plugins) {
            const customeTransformers = {};
            for (const customeTransformer of this.plugins) {
                const transformer = customeTransformer.factory(program, this);
                if (typeof transformer === "function") {
                    const key = customeTransformer.afterDeclarations ? "afterDeclarations" : customeTransformer.after ? "after" : "before";
                    const array = customeTransformers[key] || (customeTransformers[key] = []);
                    array.push(transformer);
                }
                else {
                    for (const key of ["before", "after", "afterDeclarations"]) {
                        if (transformer[key]) {
                            const array = customeTransformers[key] || (customeTransformers[key] = []);
                            if (Array.isArray(transformer[key])) {
                                array.push(...transformer[key]);
                            }
                            else {
                                array.push(transformer[key]);
                            }
                        }
                    }
                }
            }
            return customeTransformers;
        }
    }
    /**
     * 通知指定的文件已更新
     * @param path 修改的文件绝对路径
     */
    emitUpdate(path) {
        path = this.compilerHost.getCanonicalFileName(ts.normalizePath(path));
        if (this.configFilePaths.has(path)) {
            this._compilerOptionsCache.clear();
            this._fileCaches.clear();
            return;
        }
        const cache = this._fileCaches.get(path);
        if (cache) {
            cache.updated = true;
        }
    }
    /**
     * 格式化诊断信息
     * @param errors 要格式化的对象
     */
    formatErrors(errors) {
        return ts.formatDiagnostics(errors, this.compilerHost);
    }
    /**
     * 获取指定路径对应的源文件对象
     * @param fileName 文件的路径
     */
    getSourceFile(fileName) {
        var _a, _b;
        return (_b = (_a = this._program) === null || _a === void 0 ? void 0 : _a.getSourceFile(this.toPath(fileName))) !== null && _b !== void 0 ? _b : this.createProgram(fileName).getSourceFile(fileName);
    }
    /** 获取上一次编译时创建的工程对象 */
    getCurrentProgram() {
        return this._program;
    }
    /**
     * 使用内置的解析规则解析模块
     * @param moduleName 要解析的模块名
     * @param containingFile 所在的文件
     * @param redirectedReference 重定向的引用
     */
    resolveModuleName(moduleName, containingFile, redirectedReference) {
        var _a, _b;
        const options = (_b = (_a = this._program) === null || _a === void 0 ? void 0 : _a.getCompilerOptions()) !== null && _b !== void 0 ? _b : this.compilerOptions;
        return ts.resolveModuleName(moduleName, containingFile, options, this.compilerHost, undefined, redirectedReference);
    }
    /**
     * 使用内置的解析规则解析 JS 模块
     * @param moduleName 要解析的模块名
     * @param containingFile 所在的文件
     */
    resolveJSModuleName(moduleName, containingFile) {
        return ts.tryResolveJSModule(moduleName, containingFile, this.compilerHost);
    }
}
/**
 * 读取指定的 `tsconfig.json`，如果配置文件不存在则返回 `undefined`
 * @param path 要读取的配置
 * @param configFilePaths 如果传递了空集合，则返回所有已读取的文件路径
 */
export function readTSConfig(path, configFilePaths) {
    var _a;
    const parseConfigHost = {
        fileExists() { return false; },
        readFile(fileName) {
            if (configFilePaths) {
                configFilePaths.add(fileName);
            }
            return ts.sys.readFile(fileName);
        },
        readDirectory() { return [`&.ts`]; },
        useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames
    };
    const configFile = ts.readConfigFile(path, parseConfigHost.readFile);
    if (((_a = configFile.error) === null || _a === void 0 ? void 0 : _a.code) === 5083) {
        return undefined;
    }
    const basePath = ts.getDirectoryPath(path);
    const commandLine = ts.parseJsonConfigFileContent(configFile.config, parseConfigHost, basePath);
    return commandLine.options;
}
/**
 * 规范化 TypeScript 编译器选项对象
 * @param options 用户设置的选项
 * @param baseDir 解析相对地址的基路径
 * @see ts.convertCompilerOptionsFromJson
 */
export function normalizeCompilerOptions(options, baseDir) {
    const compilerOptions = {};
    for (const optionDeclaration of ts.optionDeclarations) {
        if (optionDeclaration.name in options) {
            const value = convertOption(options[optionDeclaration.name], optionDeclaration);
            if (value != undefined) {
                compilerOptions[optionDeclaration.name] = value;
            }
        }
    }
    return compilerOptions;
    function convertOption(value, optionDeclaration) {
        var _a;
        if (value == undefined) {
            return undefined;
        }
        if (optionDeclaration.type === "string") {
            if (typeof value !== "string") {
                value = String(value);
            }
            if (optionDeclaration.isFilePath) {
                return ts.getNormalizedAbsolutePath(value, baseDir) || ".";
            }
            return typeof value === "string" ? value : String(value);
        }
        if (optionDeclaration.type === "list") {
            return Array.isArray(value) ? value.map(item => convertOption(item, optionDeclaration.element)).filter(item => item != undefined) : undefined;
        }
        if (typeof optionDeclaration.type === "string") {
            return typeof value === optionDeclaration.type ? value : undefined;
        }
        return (_a = optionDeclaration.type.get(value)) !== null && _a !== void 0 ? _a : (new Set(optionDeclaration.type.values()).has(value) ? value : undefined);
    }
}
/** 比较文本的差异 */
function getTextChangeRange(oldText, newText) {
    let left = 0;
    let right = newText.length;
    while (left < right && oldText.charCodeAt(left) === newText.charCodeAt(left)) {
        left++;
    }
    if (left === right && oldText.length === newText.length) {
        return;
    }
    let oldRight = oldText.length;
    while (left < right && left < oldRight && oldText.charCodeAt(--oldRight) === newText.charCodeAt(--right)) { }
    return {
        span: {
            start: left,
            length: oldRight - left + 1
        },
        newLength: right - left + 1
    };
}
//# sourceMappingURL=typeScriptCompiler.js.map