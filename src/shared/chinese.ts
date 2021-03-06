import pinyin = require("fast-pinyin")

/**
 * 格式化自然数为中文格式（如“十三”）
 * @param value 要格式化的自然数，最大不能超过 9 亿
 * @example formatNaturalNumberToChinese(10000000) // "一千万"
 */
export function formatNaturalNumberToChinese(value: number) {
	const digits = "零一二三四五六七八九"
	const units0 = ["", "万", "亿", "万亿"]
	const units1 = ["", "十", "百", "千"]
	if (value <= 0) {
		return digits[0]
	}
	let result = ""
	for (let i = 0; i < units0.length && value > 0; i++) {
		let empty = true
		for (let j = 0; j < units1.length && value > 0; j++) {
			const digit = value % 10
			if (digit) {
				if (empty) {
					empty = false
					result = units0[i] + result
				}
				result = digits[digit] + units1[j] + result
			} else if (!empty && !result.startsWith(digits[0])) {
				result = digits[0] + result
			}
			value = Math.floor(value / 10)
		}
		if (result.charCodeAt(0) === digits.charCodeAt(1) && result.charCodeAt(1) === units1[1].charCodeAt(0)) {
			result = result.substring(1)
		}
	}
	return result
}

/**
 * 获取单个字符的拼音，如果无法查询拼音则返回 `undefined`
 * @param char 要查询的字符
 */
export function getPinYin(char: string) {
	return pinyin(char, { heteronym: true })[0]?.split("|") as string[]
}