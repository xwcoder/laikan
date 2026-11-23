# 发布约定

- 发布任务默认在本地核对工作区状态、版本号和标签，随后直接触发发布流水线。lint、测试、构建和安装包验证由 GitHub Actions 执行。
- 排查流水线的具体失败时，按需进行有针对性的本地验证。
- 发布前，根据上一正式版本 tag 到待发布提交之间的实际改动，更新 `.github/release-notes.md`。
- Release 正文使用简短的中文 Markdown 无序列表，概述用户可感知的新增功能、体验优化和问题修复，合并相关改动。
- 每条说明与该版本实际包含的改动对应，正文聚焦本版本的变化。
- 推送 `v<版本号>` 标签触发 `.github/workflows/release.yml`，由流水线读取该标签下的 `.github/release-notes.md` 作为 GitHub Release 正文。
