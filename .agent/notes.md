# AI 持续注意事项 (AI Persistent Notes)

> **重要**: 请在每次对话开始时读取此文件，以确保开发一致性。

## 1. 核心开发规则
- **语言**: 始终使用简体中文进行回复。
- **TypeScript**: 遵循最宽松模式。允许使用 `any`，不强制类型定义，不强制空值检查。以开发速度为先。
- **构建环境**: 
  - 框架版本: React Native 0.76.1
  - 关键库: `react-native-mmkv`, `react-native-nitro-modules`, `react-native-webrtc`, `react-native-libsodium`.

## 2. 已知坑位与解决方案 (Build Gotchas)
- **NitroModules 编译错误**: 
  - 在 React Native 0.76+ 中，`ReactModuleInfo` 构造函数不再支持命名参数。
  - 需要修改 `node_modules/react-native-nitro-modules/android/src/main/java/com/margelo/nitro/NitroModulesPackage.kt`，将命名参数改为位置参数。
- **Yoga / react-native-svg 编译错误**:
  - `facebook::yoga` 命名空间在 0.76 中有变动。
  - 报错：`no member named 'StyleSizeLength' in namespace 'facebook::yoga'`.
  - 临时修复：手动修改相关 CPP 文件，将 `StyleSizeLength` 改为 `StyleLength`。

## 3. 项目目标
- 纯 P2P 加密聊天 (Pchat)。
- 无中心服务器，跨端同步删除消息。
- 灵感来源：Telegram & 快播。

## 4. 常用命令提醒
- 清理安卓环境: `cd android && ./gradlew clean`
- 杀掉 Gradle 进程 (解决内存不足): `cd android && ./gradlew --stop`
- 查看 Gradle 日志: `.\gradlew.bat assembleDebug > build_log.txt 2>&1` (Windows 环境)
