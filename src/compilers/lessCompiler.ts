import less from "less"
import { basename, dirname } from "path"
import { Builder } from "../builder"

export default async function (content: string, path: string, outPath: string, builder: Builder) {
	try {
		const result: any = await less.render(content, {
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
				...builder.options.less?.sourceMap
			} : undefined,
		})
		return {
			content: result.css,
			sourceMap: result.map,
			dependencies: result.imports
		}
	} catch (e) {
		return {
			errors: [{
				message: e.message,
				fileName: e.filename,
				index: e.index,
				line: e.line - 1,
				column: e.column,
				error: e
			}]
		}
	}
}