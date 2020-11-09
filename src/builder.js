define(["require", "exports", "/tdk/vendors/_tutils@2.1.2@tutils/ansi.js", "/tdk/vendors/_tutils@2.1.2@tutils/fileSystem.js", "/tdk/vendors/_tutils@2.1.2@tutils/logger.js", "/tdk/vendors/_tutils@2.1.2@tutils/matcher.js", "/tdk/vendors/_tutils@2.1.2@tutils/misc.js", "/tdk/vendors/_tutils@2.1.2@tutils/path.js", "url", "./compilers/docCompiler.js", "./shared/typeScriptCompiler.js"], function (require, exports, ansi_1, fileSystem_1, logger_1, matcher_1, misc_1, path_1, url_1, docCompiler_1, typeScriptCompiler_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AssetUpdateType = exports.AssetType = exports.Builder = void 0;
    /** 表示一个构建器 */
    class Builder {
        /**
         * 初始化新的构建器
         * @param options 附加选项
         * @param devServer 关联的开发服务器
         */
        constructor(options, devServer) {
            var _a, _b, _c, _d;
            var _e;
            /** 获取构建器的选项 */
            this.options = {
                baseDir: ".",
                ignore: [".*", "_*", "*~", "*.tmp", "dist", "built", "bin", "out", "node_modules", "Desktop.ini", "Thumbs.db", "ehthumbs.db"],
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
            };
            /** 获取所有编译器 */
            this.compilers = [
                {
                    inExts: [".js", ".tsx", ".ts", ".jsx"],
                    outExt: ".js",
                    compile(content, path, outPath, builder) {
                        if (path === outPath) {
                            return builder.compileTypeScript(content, path, undefined, undefined, undefined, {
                                inlineSources: true
                            });
                        }
                        return builder.compileTypeScript(content, path);
                    }
                },
                {
                    inExts: [".scss", ".sass"],
                    outExt: ".css",
                    use: path_1.resolvePath(__dirname, "./compilers/sassCompiler")
                },
                {
                    inExts: [".less"],
                    outExt: ".css",
                    use: path_1.resolvePath(__dirname, "./compilers/lessCompiler")
                },
                {
                    inExts: [".md"],
                    outExt: ".html",
                    compile(content, path, outPath, builder) {
                        return builder.docCompiler.buildDocPage(content, path, outPath);
                    }
                },
                {
                    inExts: [".tsx", ".ts", ".jsx", ".js"],
                    outExt: ".html",
                    compile(content, path, outPath, builder) {
                        return builder.docCompiler.buildDocPage("", path, outPath);
                    }
                },
                {
                    inExts: [".svg"],
                    outExt: ".html",
                    use: path_1.resolvePath(__dirname, "./compilers/svgViewer")
                },
            ];
            /** 获取外部包编译器 */
            this.externalPackageCompiler = { use: path_1.resolvePath(__dirname, "./compilers/externalPackageCompiler") };
            /** 已生成的资源缓存，键为资源地址 */
            this._assets = new Map();
            /** 所有监听依赖的缓存，键为监听的绝对路径 */
            this._watchingFiles = new Map();
            /** 监听的回调函数 */
            this._watchingCallbacks = [];
            /** 判断是否正在执行最终构建 */
            this.building = false;
            options = Object.assign(this.options, options);
            this.devServer = devServer;
            if (!devServer) {
                this.options = options = merge(options, options.build);
            }
            options.baseDir = path_1.resolvePath(options.baseDir);
            options.srcDir = path_1.resolvePath(options.baseDir, options.srcDir);
            options.outDir = path_1.resolvePath(options.baseDir, options.outDir);
            options.assetsDir = path_1.resolvePath(options.baseDir, options.assetsDir);
            if (options.compilers != undefined) {
                this.compilers.unshift(...options.compilers);
            }
            this.fs = (_a = options.fs) !== null && _a !== void 0 ? _a : new fileSystem_1.FileSystem();
            this.logger = new logger_1.Logger({
                errorOrWarningCounter: false,
                ...options.logger
            });
            (_b = options.modules) !== null && _b !== void 0 ? _b : (options.modules = {});
            (_c = (_e = options.modules)["assert"]) !== null && _c !== void 0 ? _c : (_e["assert"] = "/tdk/assert");
            this.typeScriptCompiler = new typeScriptCompiler_1.TypeScriptCompiler({
                baseDir: options.baseDir,
                compilerOptions: {
                    module: "amd",
                    locale: `zh-cn`,
                    sourceMap: options.sourceMap,
                    sourceRoot: options.sourceMapRoot,
                    ...options.ts
                },
                renameModuleName: (moduleName, sourceFile) => {
                    var _a;
                    const builtinModule = options.modules[moduleName];
                    if (builtinModule) {
                        return builtinModule;
                    }
                    const containingFile = sourceFile.fileName;
                    const resolvedModule = sourceFile.resolvedModules.get(moduleName);
                    let resolvedFileName;
                    if (resolvedModule) {
                        resolvedFileName = /\.d\.ts$/i.test(resolvedModule.resolvedFileName) ? this.typeScriptCompiler.resolveJSModuleName(moduleName, containingFile) : path_1.setExt(resolvedModule.resolvedFileName, ".js");
                        if (resolvedModule.isExternalLibraryImport) {
                            const nodeModules = path_1.resolvePath(this.options.baseDir, "node_modules");
                            let path = path_1.relativePath(nodeModules, resolvedFileName);
                            if (path.startsWith("../")) {
                                path = resolvedFileName.replace(/\\/g, "/");
                                if (process.platform === "win32") {
                                    path = path.replace(/^(\w):/, "$1");
                                }
                                path = "~/" + path;
                            }
                            (_a = this.vendors) === null || _a === void 0 ? void 0 : _a.push(`tdk/vendors/${path}`);
                            return `/tdk/vendors/${path}`;
                        }
                    }
                    else {
                        const outName = this.getOutputNames(moduleName).find(url => url.endsWith(".css"));
                        if (outName) {
                            if (outName.startsWith("~/")) {
                                resolvedFileName = path_1.resolvePath(this.options.baseDir, this.options.srcDir, outName.substring(2));
                            }
                            else {
                                resolvedFileName = path_1.resolvePath(containingFile, "..", outName);
                            }
                        }
                        else {
                            return null;
                        }
                    }
                    const path = path_1.relativePath(path_1.getDir(containingFile), resolvedFileName);
                    if (path.startsWith("../")) {
                        return path;
                    }
                    if (path_1.isAbsolutePath(path)) {
                        return url_1.pathToFileURL(path).toString();
                    }
                    return "./" + path;
                },
                plugins: (_d = options.ts) === null || _d === void 0 ? void 0 : _d.plugins,
            });
            this.docCompiler = new docCompiler_1.DocCompiler(this);
            if (this.options.plugins) {
                for (const plugin of this.options.plugins) {
                    const pluginFunction = typeof plugin === "string" ? this.loadPlugin(plugin).default : plugin;
                    pluginFunction(this);
                }
            }
        }
        /**
         * 编译一段 TypeScript
         * @param content 要编译的源码，如果为 `undefined` 则自动从路径读取
         * @param fileName 源码的绝对路径，用于查找和该路径相关的配置以及解析源码中导入的相对路径
         * @param checkErrors 是否检查错误，如果为 `transpileOnly` 则只检查语法错误，忽略类型错误
         * @param moduleName 如果要生成 AMD 模块，则指定当前模块名
         * @param renameModuleName 重命名导入模块名的回调函数
         * @param options 针对当前文件的编译器选项
         */
        compileTypeScript(content, fileName, checkErrors = "transpileOnly", moduleName, renameModuleName, options) {
            const result = this.typeScriptCompiler.compile(content, fileName, checkErrors, moduleName, renameModuleName, options);
            if (result.errors.length) {
                result.errors = result.errors.map(error => {
                    const startLoc = error.file.getLineAndCharacterOfPosition(error.start);
                    const endLoc = error.file.getLineAndCharacterOfPosition(error.start + error.length);
                    return {
                        message: typeof error.messageText === "string" ? error.messageText : error.messageText.messageText,
                        fileName: error.file.fileName,
                        line: startLoc.line,
                        column: startLoc.character,
                        endLine: endLoc.line,
                        endColumn: endLoc.character,
                        codeFrame: ansi_1.formatCodeFrame(error.file.text, startLoc.line, startLoc.character, endLoc.line, endLoc.character)
                    };
                });
            }
            return result;
        }
        /**
         * 载入一个插件
         * @param name 要载入的插件名
         */
        loadPlugin(name) {
            return require(require.resolve(name, { paths: [process.cwd()] }));
        }
        /**
         * 获取指定地址对应的资源
         * @param url 要获取的地址
         */
        async getAsset(url) {
            var _a;
            if (/\.map$/i.test(url)) {
                const asset = await this.getAsset(url.slice(0, -".map".length));
                if (asset.sourceMap) {
                    return asset.sourceMap;
                }
            }
            let asset = this._assets.get(url);
            if (asset !== undefined) {
                if (asset instanceof Promise) {
                    asset = await asset;
                }
                return asset;
            }
            const promise = this.loadAsset(url);
            this._assets.set(url, promise);
            try {
                asset = await promise;
            }
            catch (e) {
                this._assets.delete(url);
                this.logger.error(e);
                throw e;
            }
            if ((_a = asset.errors) === null || _a === void 0 ? void 0 : _a.length) {
                this._assets.delete(url);
                for (const error of asset.errors) {
                    if (error.warning) {
                        this.logger.warning(error);
                    }
                    else {
                        this.logger.error(error);
                    }
                }
            }
            else {
                this._assets.set(url, asset);
                if (asset.dependencies) {
                    for (const dependency of asset.dependencies) {
                        this.watch(dependency, url);
                    }
                }
            }
            return asset;
        }
        /**
         * 生成指定的资源
         * @param url 资源的内部路径，如 `components/ui/button`
         */
        async loadAsset(url) {
            if (url.startsWith("tdk/")) {
                // tdk/data/
                if (url.startsWith("data/", "tdk/".length)) {
                    const compileResult = await this.docCompiler.buildData(url.substring("tdk/data/".length));
                    if (compileResult !== undefined) {
                        return {
                            type: 1 /* file */,
                            content: compileResult.content,
                            errors: compileResult.errors,
                            dependencies: compileResult.dependencies,
                        };
                    }
                }
                // tdk/vendors/
                if (url.startsWith("vendors/", "tdk/".length)) {
                    const moduleName = url.slice("tdk/vendors/".length);
                    const path = moduleName.startsWith("~/") ? process.platform === "win32" ? moduleName.slice(2).replace(/^(\w)\//, "$1:\\").replace(/\//g, "\\") : moduleName.slice(2) : path_1.resolvePath(this.options.baseDir, "node_modules", moduleName);
                    // 出于安全原因考虑，只允许访问路径中存在 node_modules 的模块
                    if (!/[\\/]node_modules[\\/]/i.test(path)) {
                        return {
                            type: 0 /* notFound */
                        };
                    }
                    return this.runCompiler(this.externalPackageCompiler, moduleName, path, path);
                }
                // tdk/unittest.html
                if (url === "tdk/unittest.html") {
                    const compileResult = await this.docCompiler.buildUnitTestPage(url);
                    if (compileResult !== undefined) {
                        return {
                            type: 1 /* file */,
                            content: compileResult.content,
                            errors: compileResult.errors,
                            dependencies: compileResult.dependencies,
                        };
                    }
                }
            }
            // dir/ -> dir/index.html
            let orgiginalURL;
            if (!url) {
                orgiginalURL = url;
                url = `${this.options.homePageName}.html`;
            }
            else if (url.endsWith("/")) {
                orgiginalURL = url;
                url += `${this.getMainFileName(url)}.html`;
            }
            // file.ts -> file.js
            const dependencies = [];
            const path = url.startsWith("tdk/assets/") ? path_1.joinPath(this.options.assetsDir, url.substring("tdk/assets/".length)) : path_1.joinPath(this.options.baseDir, url);
            const ext = path_1.getExt(url).toLowerCase();
            const prefix = path.slice(0, -ext.length);
            for (const compiler of this.compilers) {
                if (compiler.outExt === ext) {
                    for (const inExt of compiler.inExts) {
                        const sourcePath = prefix + inExt;
                        dependencies.push(sourcePath);
                        const content = await this.fs.readText(sourcePath, false);
                        if (content === null) {
                            continue;
                        }
                        const result = await this.runCompiler(compiler, content, sourcePath, prefix + compiler.outExt);
                        result.dependencies = misc_1.concat(dependencies, result.dependencies);
                        return result;
                    }
                }
            }
            // file.js
            dependencies.push(path);
            try {
                return {
                    type: 1 /* file */,
                    content: await this.fs.readFile(path),
                    dependencies,
                };
            }
            catch (e) {
                switch (e.code) {
                    case "ENOENT":
                        if (orgiginalURL !== undefined) {
                            break;
                        }
                        return {
                            type: 0 /* notFound */,
                            dependencies
                        };
                    case "EISDIR":
                        return {
                            type: 2 /* redirect */,
                            content: url + "/",
                            dependencies
                        };
                    default:
                        throw e;
                }
            }
            // /
            if (!orgiginalURL) {
                const compileResult = this.docCompiler.buildHomePage(orgiginalURL);
                return {
                    type: 1 /* file */,
                    content: compileResult.content,
                    errors: compileResult.errors,
                    dependencies: compileResult.dependencies,
                };
            }
            // dir/
            const dir = path_1.getDir(path);
            if (await this.fs.existsDir(dir)) {
                const compileResult = await this.docCompiler.buildIndexPage(dir);
                return {
                    type: 1 /* file */,
                    content: compileResult.content,
                    errors: compileResult.errors,
                    dependencies: misc_1.concat([dir], compileResult.dependencies),
                };
            }
            return {
                type: 0 /* notFound */,
                dependencies
            };
        }
        /**
         * 获取指定文件夹的首页名（不含扩展名）
         * @param dir 文件夹名
         */
        getMainFileName(dir) {
            return this.options.mainFileName.replace("<dir>", path_1.getName(dir)).replace("<locale>", this.options.locale);
        }
        /**
         * 使用指定的编译器编译指定的文件
         * @param compiler 要使用的编译器
         * @param content 要编译的内容
         * @param path 要编译的路径
         * @param outPath 输出的路径
         */
        async runCompiler(compiler, content, path, outPath) {
            var _a, _b;
            const compileTask = this.logger.begin(`正在生成`, this.logger.formatPath(path));
            try {
                const compile = (_a = compiler.compile) !== null && _a !== void 0 ? _a : (compiler.compile = this.loadPlugin(compiler.use).default);
                const compileResult = await compile(content, path, outPath, this);
                if ((_b = compileResult.errors) === null || _b === void 0 ? void 0 : _b.length) {
                    for (const error of compileResult.errors) {
                        if (error.codeFrame === undefined && error.fileName && error.line !== undefined) {
                            error.codeFrame = ansi_1.formatCodeFrame(error.fileName === path ? content : await this.fs.readText(error.fileName, false) || "", error.line, error.column, error.endLine, error.endColumn);
                        }
                    }
                    compileResult.content = this.docCompiler.buildErrorPage(compileResult.errors, path_1.getExt(outPath).toLowerCase(), compileResult.content);
                    compileResult.sourceMap = undefined;
                }
                return {
                    type: 1 /* file */,
                    content: compileResult.content,
                    sourceMap: compileResult.sourceMap ? {
                        type: 1 /* file */,
                        content: compileResult.sourceMap
                    } : undefined,
                    errors: compileResult.errors,
                    dependencies: compileResult.dependencies
                };
            }
            finally {
                this.logger.end(compileTask);
            }
        }
        /**
         * 添加指定的路径更新后的回调函数
         * @param path 要监听的绝对路径
         * @param callback 要添加的回调函数或资源地址
         */
        watch(path, callback) {
            if (typeof path === "function") {
                this._watchingCallbacks.push([path, callback]);
                return;
            }
            if (this.fs.isCaseInsensitive) {
                path = path.toLowerCase();
            }
            const cache = this._watchingFiles.get(path);
            if (cache) {
                cache.push(callback);
            }
            else {
                this._watchingFiles.set(path, [callback]);
            }
        }
        /**
         * 删除指定的路径更新后的回调函数
         * @param path 监听的绝对路径
         * @param callback 要删除的回调函数或资源地址
         */
        unwatch(path, callback) {
            if (typeof path === "function") {
                const index = this._watchingCallbacks.findIndex(item => item[0] === path && item[1] === callback);
                if (index >= 0) {
                    this._watchingCallbacks.splice(index, 1);
                }
                return;
            }
            if (this.fs.isCaseInsensitive) {
                path = path.toLowerCase();
            }
            const cache = this._watchingFiles.get(path);
            if (cache) {
                const index = cache.indexOf(callback);
                if (index >= 0) {
                    cache.splice(index, 1);
                }
            }
        }
        /**
         * 通知指定的路径已更新
         * @param path 更新的文件绝对路径
         * @param type 更新的类型
         */
        emitUpdate(path, type) {
            for (let i = this._watchingCallbacks.length - 1; i >= 0; i--) {
                if (this._watchingCallbacks[i][0](path, type)) {
                    const callback = this._watchingCallbacks.splice(i, 1)[0][1];
                    if (typeof callback === "string") {
                        this._assets.delete(callback);
                    }
                    else {
                        callback();
                    }
                }
            }
            if (this.fs.isCaseInsensitive) {
                path = path.toLowerCase();
            }
            this.typeScriptCompiler.emitUpdate(path);
            const cache = this._watchingFiles.get(path);
            if (cache) {
                while (cache.length) {
                    const callback = cache.pop();
                    if (typeof callback === "string") {
                        this._assets.delete(callback);
                    }
                    else {
                        callback();
                    }
                }
            }
        }
        /**
         * 立即构建资源
         * @param clean 是否在构建前清理目标文件夹
         * @param url 要构建的资源地址，如果为空则构建所有资源
         */
        async build(clean = true, url) {
            const startTime = process.hrtime();
            if (clean && !url) {
                const task = this.logger.begin(`正在清理“${this.logger.formatPath(this.options.outDir)}”文件夹`);
                await this.fs.cleanDir(this.options.outDir);
                this.logger.end(task);
            }
            this.building = true;
            this.vendors = [];
            const rootDir = url ? path_1.resolvePath(this.options.baseDir, url) : null;
            // 扫描并编译项目内所有资源
            const assets = [];
            const dirs = [this.options.baseDir, this.options.assetsDir, this.options.srcDir];
            for (let i = 0; i < dirs.length; i++) {
                await this.fs.walk(dirs[i], {
                    dir: path => !this.isIgnored(path),
                    file: path => {
                        if (this.isIgnored(path) || rootDir && !path_1.containsPath(rootDir, path, this.fs.isCaseInsensitive)) {
                            return false;
                        }
                        let url = path_1.relativePath(i === 1 ? this.options.assetsDir : this.options.baseDir, path);
                        if (i === 1) {
                            url = path_1.joinPath("tdk/assets", url);
                        }
                        if (i === 2) {
                            assets.push(this.buildModule(url));
                            return;
                        }
                        assets.push(this.buildAsset(url));
                        for (const outURL of this.getOutputNames(url)) {
                            // 忽略 assets 下文件生成的文档
                            if (i === 1 && outURL.endsWith(".html") && !url.endsWith(".html")) {
                                continue;
                            }
                            if (outURL === url) {
                                continue;
                            }
                            assets.push(this.buildAsset(outURL));
                        }
                    }
                });
            }
            // 复制包文件
            try {
                await this.fs.copyFile("package.json", path_1.resolvePath(this.options.outDir, "tdk/lib", "package.json"));
            }
            catch (_a) { }
            // 确保所有资源都生成结束
            await Promise.all(assets);
            // 生成的页面
            const generatedAssets = [];
            for await (const url of this.getGeneratedURLs()) {
                if (rootDir && !path_1.containsPath(rootDir, this.toPath(url), this.fs.isCaseInsensitive)) {
                    continue;
                }
                generatedAssets.push(this.buildAsset(url));
            }
            await Promise.all(generatedAssets);
            const time = process.hrtime(startTime);
            this.logger.success(`已全部生成到“${this.logger.formatPath(url ? path_1.joinPath(this.options.outDir, url) : this.options.outDir)}”，共 ${assets.length + generatedAssets.length} 个文件，耗时 ${misc_1.formatHRTime(time)}`);
            this.building = false;
        }
        /**
         * 构建指定地址对应的文件
         * @param url 要构建的地址
         */
        async buildAsset(url) {
            const asset = await this.getAsset(url);
            if (asset.type === 1 /* file */) {
                // 重命名首页
                let outURL = url;
                if (!outURL || outURL.endsWith("/")) {
                    outURL += this.options.outDefaultFile;
                }
                else if (path_1.getName(url) === this.getMainFileName(path_1.getDir(outURL)) + ".html") {
                    outURL = path_1.setName(url, this.options.outDefaultFile);
                }
                const outPath = path_1.resolvePath(this.options.outDir, outURL);
                const task = this.logger.begin(`正在写入 ${this.logger.formatPath(outPath)}`);
                if (asset.sourceMap) {
                    await this.fs.writeFile(outPath + ".map", asset.sourceMap.content);
                }
                await this.fs.writeFile(outPath, asset.content);
                this.logger.end(task);
            }
            return asset;
        }
        /**
         * 构建指定地址对应的模块
         * @param url 要构建的地址
         */
        async buildModule(url) {
            let asset;
            let outPath = path_1.resolvePath(this.options.outDir, "tdk/lib", path_1.relativePath(this.options.srcDir, url));
            if (/\.[jt]sx?$/i.test(url)) {
                const path = this.toPath(url);
                const content = await this.fs.readText(path);
                const compileResult = this.compileTypeScript(content, path, "transpileOnly", undefined, null, {
                    module: "esnext"
                });
                asset = {
                    type: 1 /* file */,
                    content: compileResult.content,
                    sourceMap: compileResult.sourceMap ? {
                        type: 1 /* file */,
                        content: compileResult.sourceMap
                    } : undefined,
                    errors: compileResult.errors,
                    dependencies: compileResult.dependencies
                };
                outPath = path_1.setExt(outPath, ".js");
            }
            else if (path_1.getName(url).toLowerCase() === "package.json") {
                const path = this.toPath(url);
                const content = await this.fs.readText(path);
                const data = JSON.parse(content);
                if (!data.main && data.types) {
                    data.main = path_1.setExt(data.types, ".js");
                }
                asset = {
                    type: 1 /* file */,
                    content: JSON.stringify(data, undefined, 2),
                    dependencies: [path]
                };
            }
            else if (/\.md$/i.test(url)) {
                const path = this.toPath(url);
                asset = {
                    type: 1 /* file */,
                    content: await this.fs.readFile(path),
                    dependencies: [path]
                };
            }
            else {
                asset = await this.getAsset(url);
                outPath = this.getOutputName(outPath);
            }
            if (asset.type === 1 /* file */) {
                const task = this.logger.begin(`正在写入 ${this.logger.formatPath(outPath)}`);
                if (asset.sourceMap) {
                    await this.fs.writeFile(outPath + ".map", asset.sourceMap.content);
                }
                await this.fs.writeFile(outPath, asset.content);
                this.logger.end(task);
            }
            return asset;
        }
        /**
         * 获取项目的根文件夹
         */
        async getRootDirNames() {
            var _a;
            return (_a = this._rootDirNames) !== null && _a !== void 0 ? _a : (this._rootDirNames = (await this.fs.readDir(this.options.baseDir, true)).filter(entry => entry.isDirectory() && !this.isIgnored(this.toPath(entry.name + "/"))).map(entry => entry.name));
        }
        /**
         * 获取动态生成的所有文件的地址
         */
        async *getGeneratedURLs() {
            // 首页
            yield "";
            // 列表页
            for (const rootDirName of await this.getRootDirNames()) {
                yield rootDirName + "/";
            }
            // 数据
            for await (const dataURL of this.docCompiler.getGeneratedDataURLs()) {
                yield `tdk/data/${dataURL}`;
            }
            // 三方包
            yield* this.vendors;
        }
        /**
         * 返回指定路径的访问地址
         * @param path 要获取的绝对路径
         */
        toURL(path) {
            return path_1.relativePath(this.options.baseDir, path);
        }
        /**
         * 获取访问指定资源的最短地址
         * @param path 要访问的资源路径
         */
        toShortURL(path) {
            const url = this.toURL(path);
            if (url === `${this.options.homePageName}.html`) {
                return "";
            }
            if (path_1.getName(path) === this.getMainFileName(path_1.getDir(path)) + ".html") {
                return path_1.getDir(url);
            }
            return url;
        }
        /**
         * 返回指定地址对应的绝对路径
         * @param path 要获取的地址
         */
        toPath(url) {
            return path_1.joinPath(this.options.baseDir, url);
        }
        /**
        * 获取指定模块生成的模块名
        * @param name 源模块名
        */
        getOutputName(name) {
            const ext = path_1.getExt(name).toLowerCase();
            for (const compiler of this.compilers) {
                if (compiler.inExts.includes(ext)) {
                    return path_1.setExt(name, compiler.outExt);
                }
            }
            return name;
        }
        /**
        * 获取指定模块生成的所有模块名
        * @param name 源模块名
        */
        getOutputNames(name) {
            const result = [];
            const ext = path_1.getExt(name).toLowerCase();
            for (const compiler of this.compilers) {
                if (compiler.inExts.includes(ext)) {
                    result.push(path_1.setExt(name, compiler.outExt));
                }
            }
            if (!result.length) {
                result.push(name);
            }
            return result;
        }
        /**
         * 获取指定模块生成的 HTML 模块名，如果模块无法生成 HTML，则返回原地址
         * @param name 源模块名
         */
        getHTMLOutputName(name) {
            const ext = path_1.getExt(name).toLowerCase();
            for (const compiler of this.compilers) {
                if (compiler.outExt === ".html" && compiler.inExts.includes(ext)) {
                    return path_1.setExt(name, this.options.noExtension ? "" : compiler.outExt);
                }
            }
            return name;
        }
        /**
         * 计算生成指定文件的源文件名，如果找不到则返回 `undefined`
         * @param name 生成的文件名
         * @param entries 文件夹下的所有文件名
         */
        getInputName(name, entries) {
            const ext = path_1.getExt(name).toLowerCase();
            for (const compiler of this.compilers) {
                if (compiler.outExt === ext) {
                    for (const inExt of compiler.inExts) {
                        const inName = path_1.setExt(name, inExt);
                        if (entries.some(item => path_1.pathEquals(item, inName, this.fs.isCaseInsensitive))) {
                            return inName;
                        }
                    }
                }
            }
        }
        /**
         * 判断指定的路径是否被忽略
         * @param path 要判断的绝对路径
         */
        isIgnored(path) {
            if (!path_1.containsPath(this.options.baseDir, path, this.fs.isCaseInsensitive)) {
                return true;
            }
            if (!this._ignoreMatcher) {
                this._ignoreMatcher = new matcher_1.Matcher(this.options.ignore, this.options.baseDir, this.fs.isCaseInsensitive);
                this._ignoreMatcher.include(this.options.outDir);
            }
            return this._ignoreMatcher.test(path);
        }
    }
    exports.Builder = Builder;
    /** 表示资源的类型 */
    var AssetType;
    (function (AssetType) {
        /** 资源不存在 */
        AssetType[AssetType["notFound"] = 0] = "notFound";
        /** 当前资源是一个文件 */
        AssetType[AssetType["file"] = 1] = "file";
        /** 当前资源需要外部重定向到另一个资源 */
        AssetType[AssetType["redirect"] = 2] = "redirect";
    })(AssetType = exports.AssetType || (exports.AssetType = {}));
    /** 表示资源更新的类型 */
    var AssetUpdateType;
    (function (AssetUpdateType) {
        /** 资源被创建 */
        AssetUpdateType[AssetUpdateType["created"] = 0] = "created";
        /** 资源被修改 */
        AssetUpdateType[AssetUpdateType["changed"] = 1] = "changed";
        /** 资源被删除 */
        AssetUpdateType[AssetUpdateType["deleted"] = 2] = "deleted";
    })(AssetUpdateType = exports.AssetUpdateType || (exports.AssetUpdateType = {}));
    /**
     * 合并所有对象，如果两个对象包含同名的数组，则将这些数组合并为一个
     * @param target 要合并的目标对象
     * @param sources 要合并的源对象
     * @example merge({x: [0], y: 0}, {x: [1], y: 2}) // {x: [0, 1], y: 2}
     */
    function merge(target, ...sources) {
        const cloned = new Map();
        for (const source of sources) {
            target = merge(target, source);
        }
        return target;
        function merge(target, source) {
            if (typeof target === "object" && typeof source === "object") {
                if (Array.isArray(target) && Array.isArray(source)) {
                    return [...target, ...source];
                }
                const exists = cloned.get(source);
                if (exists !== undefined) {
                    return exists;
                }
                const result = { ...target };
                cloned.set(source, result);
                for (const key in source) {
                    result[key] = merge(result[key], source[key]);
                }
                return result;
            }
            return source;
        }
    }
});
//# sourceMappingURL=builder.js.map