import { Builder } from "../builder"
import { readConfigs } from "../configs"

export default async function (options: any) {
	const builder = new Builder(readConfigs())
	return await builder.build(!options["--no-clean"], options[1])
}

export const description = "生成整个项目或特定模块"
export const argument = "模块名"
export const argumentOptional = true