import toAnchor = require("uslug")

/** 表示一个目录管理器 */
export class TOCManager {

	/**
	 * 生成计数器的回调函数
	 * @param counts 每一级的项数
	 * @param item 当前要生成的索引项
	 * @return 返回生成的计数器
	 */
	readonly counter?: (counts: number[], item: TOCItem) => string | undefined

	/** 开始计数的索引 */
	readonly counterStart: number

	/**
	 * 初始化新的目录管理器
	 * @param counter 生成计数器的回调函数
	 * @param counterStart 开始计数的索引
	 */
	constructor(counter = (counts: number[], item: TOCItem) => item.level === 0 ? `${counts[counts.length - 1]}. ` : item.level === 1 ? `${counts[counts.length - 2]}.${counts[counts.length - 1]} ` : undefined, counterStart = 2) {
		this.counter = counter
		this.counterStart = counterStart
	}

	/** 获取所有顶级目录项 */
	readonly items: TOCItem[] = []

	/** 当前每个缩进等级的容器 */
	private readonly _containers: TOCItem[][] = [this.items]

	/** 当前每个缩进等级的个数 */
	private readonly _counts: number[] = [0]

	/**
	 * 添加一个目录项
	 * @param label 目录的内容
	 * @param level 目录的等级
	 * @param anchor 自定义描点
	 * @param counter 自定义计数器
	 */
	add(label: string, level: number, anchor?: string, counter?: string) {
		if (anchor === undefined) {
			anchor = this.addAnchor(label)
		} else {
			this._anchors.add(anchor)
		}
		const result: TOCItem = {
			level,
			label,
			anchor,
			counter
		}
		this._counts.length = this._containers.length = level + 1
		// 第一次添加当前级别的项
		let container = this._containers[level]
		if (!container) {
			this._containers[level] = container = []
			this._counts[level] = 0
			for (let parentLevel = level - 1; parentLevel >= 0; parentLevel--) {
				const parentContainer = this._containers[parentLevel]
				// 如果上一次添加了 1 级目录，这次添加了 3 级目录，就会出现父级为空的情况
				const parent = parentContainer?.[parentContainer.length - 1]
				if (parent) {
					// 如果上一次添加了 1 级目录，然后依次添加 4 级目录和 3 级目录，就会出现父级已有子项的情况
					if (parent.items) {
						container.push(...parent.items)
					}
					parent.items = container
					break
				}
			}
		}
		const count = ++this._counts[level]
		// 生成计数器
		if (this.counter && count >= this.counterStart) {
			// 假如需求是仅当同级目录出现 2 次以上才生成计数器，那么在添加第 3 项时，先生成前 2 项的计数器
			if (count === this.counterStart) {
				for (let i = 0; i < container.length; i++) {
					this._counts[level] = i + 1
					container[i].counter ??= this.counter(this._counts, container[i])
				}
				this._counts[level] = count
			}
			result.counter ??= this.counter(this._counts, result)
		}
		container.push(result)
		return result
	}

	/** 所有用过的描点 */
	private readonly _anchors = new Set<string>()

	/**
	 * 添加一个新描点
	 * @param label 原始文案
	 */
	addAnchor(label: string) {
		let anchor = toAnchor(label)
		if (this._anchors.has(anchor)) {
			let postfix = 2
			while (this._anchors.has(`${anchor}-${postfix}`)) {
				postfix++
			}
			anchor = `${anchor}-${postfix}`
		}
		this._anchors.add(anchor)
		return anchor
	}

	/**
	 * 查找满足条件的第一个索引项，如果找不到返回 `undefined`
	 * @param callback 判断是否满足条件的回调函数
	 * @param parent 如果指定的根节点从只从指定节点范围查找
	 */
	findItem(callback: (item: TOCItem, parent: TOCItem | TOCManager) => boolean, parent: TOCItem | TOCManager = this): TOCItem | undefined {
		for (const child of parent.items) {
			if (callback(child, parent)) {
				return child
			}
			if (child.items) {
				const childResult = this.findItem(callback, child)
				if (childResult) {
					return childResult
				}
			}
		}
	}

	/**
	 * 查找指定内容的描点
	 * @param label 目录的内容
	 */
	findAnchor(label: string) {
		return this.findItem(item => item.label === label)?.anchor
	}

	/**
	 * 获取指定描点的文本内容
	 * @param anchor 描点
	 */
	findLabel(anchor: string) {
		return this.findItem(item => item.anchor === anchor)?.label
	}

	/**
	 * 获取指定文案的描点
	 * @param label 文案
	 */
	toAnchor(label: string) {
		return toAnchor(label)
	}

}

/** 表示一个目录项 */
export interface TOCItem {
	/** 当前目录项的缩进等级 */
	level: number
	/** 当前目录项的文案 */
	label: string
	/** 当前目录项的描点 */
	anchor: string
	/** 当前目录项的计数器 */
	counter?: string
	/** 子级目录项 */
	items?: TOCItem[]
}