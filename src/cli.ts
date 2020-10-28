#!/usr/bin/env node
main(process.argv)

/** 入口函数 */
function main(argv: string[]) {
	if (requireLocal("tdk/dist/cli.js")) {
		return
	}
	exitOnUncaughError()
	if (/^v(?:\d|10\.\d|10\.1[01])\./.test(process.version)) {
		console.error(`[×] TDK 需要 Node.js v10.12 或更高版本(现在是 ${process.version})`)
		console.info(`请访问 https://nodejs.org/ 下载安装最新版本`)
		return process.exit(-1)
	}
	const { parseCommandLineArguments } = require("tutils/commandLine") as typeof import("tutils/commandLine")
	const options = parseCommandLineArguments(undefined, undefined, argv, 2)
	let commandPath: string
	try {
		if (options[0]) {
			commandPath = require.resolve(`./cli/${/^\w+$/.test(options[0]) ? options[0] : "help"}`)
		} else if (options["--version"] || options["-v"] || options["-V"]) {
			commandPath = require.resolve("./cli/version")
		} else if (options["--help"] || options["-h"] || options["-?"]) {
			commandPath = require.resolve("./cli/help")
		} else {
			commandPath = require.resolve("./cli/start")
		}
	} catch (e) {
		if (e.code !== "MODULE_NOT_FOUND") {
			throw e
		}
		if (options[0]) {
			process.exitCode = 1
			console.error(`不支持命令“${options[0]}”(版本太低?)`)
		}
		commandPath = require.resolve("./cli/help")
	}
	return require(commandPath).default(options)
}

/** 尝试载入本地安装的命令行程序 */
function requireLocal(cli: string) {
	let localCLI: string
	try {
		localCLI = require.resolve(cli, { paths: [process.cwd()] })
	} catch {
		return false
	}
	return localCLI !== __filename && require(localCLI) !== exports
}

/** 设置出现未捕获的异常直接退出 */
function exitOnUncaughError() {
	process.on("uncaughtException", e => {
		console.error(e)
		process.exit(2)
	})
	process.on("unhandledRejection", e => {
		console.error(e)
		process.exit(3)
	})
}