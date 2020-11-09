import { readdirSync } from "fs";
import { formatCommandLineOptions } from "tutils/commandLine";
import { getName } from "tutils/path";
import { version } from "../configs";
export default function () {
    const commands = {};
    for (const file of readdirSync(__dirname)) {
        const commandName = getName(file, false);
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
    console.info(`TDK v${version()}\n${formatCommandLineOptions(commands)}`);
}
export const description = "打印帮助信息";
//# sourceMappingURL=help.js.map