import { DevServer } from "../devServer"
import { readConfigs } from "../configs"

export default async function (options: any) {
	const devServer = new DevServer(readConfigs())
	const openURL = options["--open"] || options["-o"]
	await devServer.start(openURL)
	if (openURL) {
		const { open } = require("tutils/process") as typeof import("tutils/process")
		const { resolveURL } = require("tutils/url") as typeof import("tutils/url")
		await open(resolveURL(devServer.url ?? `http://localhost:${devServer.port}${devServer.rootPath || "/"}`, openURL ?? devServer.builder.options.srcDir))
	}
	return devServer
}

export const description = "启动本地开发服务"
export const argument = "URL"
export const argumentOptional = true