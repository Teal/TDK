define(["require", "exports", "fs", "/tdk/vendors/_tutils@2.1.2@tutils/commandLine.js", "/tdk/vendors/_tutils@2.1.2@tutils/path.js", "../configs.js"], function (require, exports, fs_1, commandLine_1, path_1, configs_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.description = void 0;
    function default_1() {
        const commands = {};
        for (const file of fs_1.readdirSync(__dirname)) {
            const commandName = path_1.getName(file, false);
            if (commandName.endsWith(".d")) {
                continue;
            }
            const command = require(`./${commandName}`);
            if (command.default) {
                commands[`$ tdk ${commandName}`] = {
                    description: command.description,
                    argument: command.argument,
                    default: command.argumentOptional ? null : undefined,
                };
            }
        }
        console.info(`TDK v${configs_1.version()}\n${commandLine_1.formatCommandLineOptions(commands)}`);
    }
    exports.default = default_1;
    exports.description = "打印帮助信息";
});
//# sourceMappingURL=help.js.map