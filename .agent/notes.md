# AI 持续注意事项 (AI Persistent Notes)

> **重要**: 请在每次对话开始时读取此文件,以确保开发一致性。

## 🚨 最高优先级规则 (CRITICAL - 必须遵守!)
- **包管理器**: **必须使用 yarn**,禁止使用 npm! 用户已强调多次!
  - 安装包: `yarn add <package>`
  - 删除包: `yarn remove <package>`
  - 安装依赖: `yarn install`
  - 清理缓存: `yarn cache clean`

## 1. 核心开发规则
- **语言**: 始终使用简体中文进行回复。
- **TypeScript**: 遵循最宽松模式。允许使用 `any`,不强制类型定义,不强制空值检查。以开发速度为先。
- **构建环境**: 
  - 框架版本: React Native 0.76.1
  - 关键库: `react-native-mmkv`, `react-native-nitro-modules`, `react-native-webrtc`, `react-native-libsodium`.

## 2. 已知坑位与解决方案 (Build Gotchas)
- **NitroModules 编译错误**: 
  - 在 React Native 0.76+ 中,`ReactModuleInfo` 构造函数不再支持命名参数。
  - 需要修改 `node_modules/react-native-nitro-modules/android/src/main/java/com/margelo/nitro/NitroModulesPackage.kt`,将命名参数改为位置参数。
- **react-native-svg 版本兼容性** (已解决):
  - RN 0.76.1 与 `react-native-svg` v15.13.0+ 不兼容
  - 必须使用 v15.12.0 或更低版本
  - 原因: Yoga 3.0 移除了 `StyleSizeLength`,改用 `StyleLength`
  - 已降级到 15.12.0
- **react-native-libsodium CMake 路径错误** (Windows):
  - Windows 路径分隔符导致 CMake 语法错误
  - 修复: 在 `node_modules/react-native-libsodium/android/CMakeLists.txt` 第 34 行添加 `file(TO_CMAKE_PATH ...)` 转换路径
  - 错误信息: `Syntax error in cmake code when parsing string`
- **Zeroconf 权限错误** (Android):
  - 错误: `Neither user nor current process has android.permission.CHANGE_WIFI_MULTICAST_STATE`
  - 修复: 在 `android/app/src/main/AndroidManifest.xml` 添加权限:
    - `CHANGE_WIFI_MULTICAST_STATE`
    - `CHANGE_WIFI_STATE`
  - 需要重新编译安装应用

## 3. 项目目标
- 纯 P2P 加密聊天 (Pchat)。
- 无中心服务器,跨端同步删除消息。
- 灵感来源：Telegram & 快播。

## 4. 常用命令提醒
- **包管理**: 使用 `yarn` 而非 npm
- 清理安卓环境: `cd android && ./gradlew clean`
- 杀掉 Gradle 进程 (解决内存不足): `cd android && ./gradlew --stop`
- 查看 Gradle 日志: `.\gradlew.bat assembleDebug > build_log.txt 2>&1` (Windows 环境)
