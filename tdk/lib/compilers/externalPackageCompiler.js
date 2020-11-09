import MemoryFS from "memory-fs";
import { dirname, resolve as resolvePath } from "path";
import webpack from "webpack";
export default function (content, path, outPath, builder) {
    return new Promise(resolve => {
        var _a;
        const wp = webpack({
            mode: builder.options.optimize ? "production" : "development",
            entry: path,
            context: dirname(path),
            ...builder.options.webpack,
            output: {
                path: builder.options.baseDir,
                filename: "&.js",
                libraryTarget: "amd",
                devtoolModuleFilenameTemplate: "npm://[namespace]/[resource-path]?[loaders]",
                ...(_a = builder.options.webpack) === null || _a === void 0 ? void 0 : _a.output
            }
        });
        const fs = wp.outputFileSystem = new MemoryFS();
        wp.run((err, stats) => {
            if (err) {
                err.fileName = path;
                resolve({
                    errors: [err]
                });
            }
            else {
                const distFile = resolvePath(builder.options.baseDir, "&.js");
                if (!fs.existsSync(distFile) || stats.hasErrors()) {
                    for (const error of stats.compilation.errors) {
                        error.fileName = path;
                    }
                    resolve({
                        errors: stats.compilation.errors
                    });
                }
                else {
                    resolve({
                        content: fs.readFileSync(distFile)
                    });
                }
            }
        });
    });
}
//# sourceMappingURL=externalPackageCompiler.js.map