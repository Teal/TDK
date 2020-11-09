define(["require", "exports", "../builder.js", "../configs.js"], function (require, exports, builder_1, configs_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.argumentOptional = exports.argument = exports.description = void 0;
    async function default_1(options) {
        const builder = new builder_1.Builder(configs_1.readConfigs());
        return await builder.build(!options["--no-clean"], options[1]);
    }
    exports.default = default_1;
    exports.description = "生成整个项目或特定模块";
    exports.argument = "模块名";
    exports.argumentOptional = true;
});
//# sourceMappingURL=build.js.map