import less from "less";
import { basename, dirname } from "path";
export default async function (content, path, outPath, builder) {
    var _a;
    try {
        const result = await less.render(content, {
            filename: path,
            paths: [builder.options.srcDir],
            async: true,
            fileAsync: true,
            rewriteUrls: "all",
            compress: false,
            ...builder.options.less,
            sourceMap: builder.options.sourceMap ? {
                outputFilename: outPath,
                sourceMapRootpath: builder.options.sourceMapRoot,
                sourceMapBasepath: builder.options.sourceMapRoot === "file:///" ? undefined : dirname(outPath),
                sourceMapURL: basename(outPath) + ".map",
                ...(_a = builder.options.less) === null || _a === void 0 ? void 0 : _a.sourceMap
            } : undefined,
        });
        return {
            content: result.css,
            sourceMap: result.map,
            dependencies: result.imports
        };
    }
    catch (e) {
        return {
            errors: [{
                    message: e.message,
                    fileName: e.filename,
                    index: e.index,
                    line: e.line - 1,
                    column: e.column,
                    error: e
                }]
        };
    }
}
//# sourceMappingURL=lessCompiler.js.map