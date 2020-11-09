import { DevServer } from "../devServer";
import { readConfigs } from "../configs";
export default async function (options) {
    var _a;
    const devServer = new DevServer(readConfigs());
    const openURL = options["--open"] || options["-o"];
    await devServer.start(openURL);
    if (openURL) {
        const { open } = require("tutils/process");
        const { resolveURL } = require("tutils/url");
        await open(resolveURL((_a = devServer.url) !== null && _a !== void 0 ? _a : `http://localhost:${devServer.port}${devServer.rootPath}`, openURL !== null && openURL !== void 0 ? openURL : devServer.builder.options.srcDir));
    }
    return devServer;
}
export const description = "启动本地开发服务";
export const argument = "URL";
export const argumentOptional = true;
//# sourceMappingURL=start.js.map