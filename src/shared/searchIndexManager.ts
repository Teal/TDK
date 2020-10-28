import { getPinYin } from "./chinese"

/** 表示一个搜索索引管理器 */
export class SearchIndexManager {

	/** 获取所有索引项 */
	readonly items: SearchIndexItem[] = []

	/** 获取所有内嵌的汉字拼音 */
	readonly pinyins: { [key: string]: string[] } = {}

	/**
	 * 添加一个搜索项
	 * @param title 标题
	 * @param subtitle 副标题
	 * @param url 地址
	 * @param keywords 指定额外关键字
	 */
	add(title: string, subtitle: string | undefined, url: string, keywords?: string[]) {
		const item: SearchIndexItem = {
			title,
			subtitle,
			url,
			keywords
		}
		this.items.push(item)
		this.addPinYin(title)
		if (subtitle) this.addPinYin(subtitle)
		if (keywords) {
			for (const keyword of keywords) {
				this.addPinYin(keyword)
			}
		}
	}

	/**
	 * 添加字符串中的中文拼音数据
	 * @param value 要添加的字符串
	 */
	addPinYin(value: string) {
		for (const char of value) {
			const pinyin = getPinYin(char)
			if (pinyin) {
				this.pinyins[char] ??= pinyin
			}
		}
	}

}

/** 表示一个搜索索引项 */
export class SearchIndexItem {
	/** 当前搜索项的标题 */
	title: string
	/** 当前搜索项的副标题 */
	subtitle?: string
	/** 当前搜索项的地址 */
	url: string
	/** 当前搜索项的额外关键字 */
	keywords?: string[]
}