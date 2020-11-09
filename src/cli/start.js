define(["require", "exports", "../devServer.js", "../configs.js"], function (require, exports, devServer_1, configs_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.argumentOptional = exports.argument = exports.description = void 0;
    async function default_1(options) {
        var _a;
        const devServer = new devServer_1.DevServer(configs_1.readConfigs());
        const openURL = options["--open"] || options["-o"];
        await devServer.start(openURL);
        if (openURL) {
            const { open } = require("tutils/process");
            const { resolveURL } = require("tutils/url");
            await open(resolveURL((_a = devServer.url) !== null && _a !== void 0 ? _a : `http://localhost:${devServer.port}${devServer.rootPath}`, openURL !== null && openURL !== void 0 ? openURL : devServer.builder.options.srcDir));
        }
        return devServer;
    }
    exports.default = default_1;
    exports.description = "启动本地开发服务";
    exports.argument = "URL";
    exports.argumentOptional = true;
});
//# sourceMappingURL=start.js.map