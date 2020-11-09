define(["require", "exports", "/tdk/vendors/_h2server@0.3.0@h2server/dist/index.js", "/tdk/vendors/_tutils@2.1.2@tutils/ansi.js", "/tdk/vendors/_tutils@2.1.2@tutils/fileSystemWatcher.js", "./builder.js"], function (require, exports, h2server_1, ansi_1, fileSystemWatcher_1, builder_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DevServer = void 0;
    /** 表示一个开发服务器 */
    class DevServer extends h2server_1.WebServer {
        /**
         * 初始化新的开发服务器
         * @param options 附加选项
         */
        constructor(options) {
            var _a, _b, _c, _d;
            super(options === null || options === void 0 ? void 0 : options.devServer);
            /** 获取所有对外的 HTTP 接口 */
            this.apis = {
                "livereload.js"(request, response, server) {
                    if (server.liveReloadServer) {
                        server.liveReloadServer.writeScript(request, response);
                    }
                    else {
                        server.writeError(request, response, 404);
                    }
                },
                remoteHost(request, response, server) {
                    const { remoteIP } = require("tutils/net");
                    response.end(remoteIP());
                }
            };
            /** 生成哈希值的前缀 */
            this._hashPrefix = `${Date.now().toString(36).slice(2)}${process.hrtime()[1].toString(36)}_`;
            /** 生成哈希值的计数器 */
            this._hashSeed = 0;
            Object.assign(this.apis, (_a = options === null || options === void 0 ? void 0 : options.devServer) === null || _a === void 0 ? void 0 : _a.apis);
            this.builder = new builder_1.Builder(options, this);
            const liveReload = (_b = options === null || options === void 0 ? void 0 : options.devServer) === null || _b === void 0 ? void 0 : _b.liveReload;
            if (liveReload !== false) {
                const liveReloadOptions = liveReload === true ? undefined : liveReload;
                this.liveReloadServer = new h2server_1.LiveReloadServer({
                    ...liveReloadOptions,
                    server: this
                });
                this.liveReloadServer.on("error", () => { });
                this.builder.docCompiler.options.injectFoot = `${((_c = this.builder.docCompiler.options.injectFoot) !== null && _c !== void 0 ? _c : "")}<script src="/tdk/api/livereload.js"></script>`;
                this.liveReloadDelay = (_d = liveReloadOptions === null || liveReloadOptions === void 0 ? void 0 : liveReloadOptions.delay) !== null && _d !== void 0 ? _d : 360;
            }
            this.watcher = new fileSystemWatcher_1.FileSystemWatcher({
                ignore: this.builder.options.ignore
            });
            this.watcher.on("create", (path) => {
                this.builder.emitUpdate(path, 0 /* created */);
                this.reload(path);
            });
            this.watcher.on("createDir", (path) => {
                this.builder.emitUpdate(path, 0 /* created */);
                this.reload(path);
            });
            this.watcher.on("change", (path) => {
                this.builder.emitUpdate(path, 1 /* changed */);
                this.reload(path);
            });
            this.watcher.on("delete", (path) => {
                this.builder.emitUpdate(path, 2 /* deleted */);
                this.reload(path);
            });
            this.watcher.on("deleteDir", (path) => {
                this.builder.emitUpdate(path, 2 /* deleted */);
                this.reload(path);
            });
        }
        /** 启动服务器 */
        async start(ignoreError) {
            try {
                await super.start();
                this.builder.logger.info(`${ansi_1.color(`服务已启动: `, 96 /* brightCyan */)} ${this.url}`, true);
            }
            catch (e) {
                if (!ignoreError) {
                    if (e.code === "EADDRINUSE") {
                        this.builder.logger.fatal(`无法启动服务器: 端口 ${e.port} 被其它程序占用(之前已经启动服务了?)`);
                    }
                    else {
                        this.builder.logger.fatal(`无法启动服务器: ${e.stack}`);
                    }
                }
                return;
            }
            const watchTask = this.builder.logger.begin(`初始化监听`);
            try {
                this.watcher.add(this.builder.options.baseDir);
            }
            finally {
                this.builder.logger.end(watchTask);
            }
        }
        /** 关闭服务器 */
        async close() {
            await new Promise(resolve => this.watcher.close(resolve));
            if (this.liveReloadServer) {
                await this.liveReloadServer.close();
            }
            await super.close();
            this.builder.logger.info(ansi_1.color(`服务已停止`, 96 /* brightCyan */), true);
        }
        /**
         * 默认路由
         * @param request 当前的请求对象
         * @param response 当前的响应对象
         */
        async defaultRouter(request, response) {
            var _a, _b;
            const url = request.path.replace(/^(\/|\.\.\/)+/, "");
            if (url.startsWith("tdk/api/")) {
                const urlPath = url.substring("tdk/api/".length);
                const api = this.apis[urlPath];
                if (api) {
                    return api(request, response, this);
                }
                return this.writeError(request, response, 404);
            }
            this.watcher.pause();
            try {
                const asset = await this.builder.getAsset(url);
                switch (asset.type) {
                    case 1 /* file */:
                        (_a = asset.hash) !== null && _a !== void 0 ? _a : (asset.hash = `${this._hashPrefix}${(this._hashSeed++).toString(36)}`);
                        const ifNoneMatch = request.headers["if-none-match"];
                        if (ifNoneMatch === asset.hash) {
                            response.writeHead(304, this.headers);
                            response.end();
                            break;
                        }
                        response.writeHead(200, {
                            "Content-Type": (_b = h2server_1.getMimeType(url, { ".ts": "text/typescript", ...this.mimeTypes })) !== null && _b !== void 0 ? _b : "text/html",
                            "ETag": asset.hash,
                            ...this.headers
                        });
                        response.end(asset.content);
                        break;
                    case 2 /* redirect */:
                        response.redirect(`/${asset.content}${request.search ? "?" + request.search : ""}`);
                        break;
                    default:
                        this.writeError(request, response, 404);
                        break;
                }
            }
            finally {
                this.watcher.resume();
            }
        }
        /** 实时刷新页面 */
        reload(path) {
            if (this._reloadTimer) {
                clearTimeout(this._reloadTimer);
            }
            this._reloadTimer = setTimeout(() => {
                this._reloadTimer = undefined;
                this.liveReloadServer.reload(path);
            }, this.liveReloadDelay);
        }
    }
    exports.DevServer = DevServer;
});
//# sourceMappingURL=devServer.js.map