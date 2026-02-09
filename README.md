# 纯对话 - pulsechat (简称: Pchat)

移动端纯 P2P 加密聊天应用，支持跨端同步删除消息。

---

## 👨‍💻 作者信息

- **作者**: [追风俊码 - 布莱恩·奥弗托·杰森张]
- **GitHub**: [[追风俊码](https://github.com/bulaienaofutuojiesenzhang)]
- **抖音号**: [[追风俊码](https://v.douyin.com/61z583eMUps)]
- **B站号**: [[追风俊码](https://b23.tv/A7lfRgE)]
- **快手号**: [[追风俊码](https://v.kuaishou.com/nSIIvD61)]

---

## 🚀 要实现的功能

| 模块 | 选型 | 作用 |
| :--- | :--- | :--- |
| **RN基础** | React Native 0.76.x | 移动端跨端渲染 |
| **P2P传输** | `react-native-webrtc` + STUN | WebRTC DataChannel P2P 直连、NAT 穿透 |
| **P2P信令发现** | `react-native-zeroconf` / DHT | 节点发现，无中心服务器 |
| **加密** | `react-native-libsodium` | Ed25519 身份认证、应用层加解密混淆 |
| **本地存储** | `react-native-mmkv` | 端侧加密存储聊天记录，高性能 |
| **消息同步** | 自定义 P2P 控制指令 | 消息删除指令跨节点同步、状态校验 |

*灵感来源：小飞机 (Telegram) & 快播*

---

## 🛠 技术栈

| 类别 | 技术 | 版本 |
| :--- | :--- | :--- |
| **框架** | React Native | 0.76.1 |
| **React** | React | 18.3.1 |
| **语言** | TypeScript (宽松模式) | 5.x |
| **状态管理** | Redux Toolkit + React Redux | ^2.11.2 / ^9.2.0 |
| **持久化** | Redux Persist | ^6.0.0 |
| **导航** | React Navigation | ^7.x |
| **UI组件库** | RNEUI (React Native Elements) | ^5.0.0 |
| **本地存储** | MMKV / AsyncStorage | ^4.1.2 / ^2.2.0 |
| **SVG 支持** | react-native-svg | 15.12.0 (⚠️ 固定版本) |

---

## 🛡️ 安全性与保密过程 (Security Architecture)

PulseChat 并非发送明文，它通过**三层防护体系**确保数据的私密性与完整性，安全等级对标并部分超越 Telegram 的普通策略（由于其纯 P2P 特性）：

### 1. 身份层：非对称加密 (Identity Layer)
本项目使用了 `libsodium` (Ed25519) 非对称加密算法：
- 每个设备在首次启动时生成一对**公钥和私钥**。
- 您的 **Peer ID** 就是公钥的导出值。
- 这确保了没有任何人能伪造您的身份发送消息，只有拥有私钥的人才能控制该账号。

### 2. 传输层：WebRTC DTLS/SRTP (Transport Layer)
这是底层通信的安全基石，采用了工业级的非对称/对称混合加密：
- **握手阶段**：通过非对称加密进行密钥协商（类似 HTTPS）。
- **数据传输**：协商成功后，所有数据（文字、图片、语音）通过 **AES-128/256** 对称加密进行 P2P 传输。
- **效果**：即便黑客截获了数据包，在没有解密密钥的情况下，也只能看到“杂乱无章”的二进制流。

### 3. 应用层：用户自定义密钥 (Application Layer)
这是根据用户提出的“乱码测试”需求实现的保底层（基于 XOR 算法）：
- 用户可以设置一个**聊天信令/密码** (Pre-shared Key)。
- 该层确保了：即便对方截获了数据并突破了传输层，如果其**密钥不匹配**，在主界面上看到的消息仍然是**高度混淆的乱码**。
- **默认状态**：为方便测试，系统预设密钥为 `123456`。

### 对比 Telegram
- **Telegram**：消息经过中心服务器中转（Secret Chat 除外），理论上服务器端有读取权限。
- **PulseChat**：纯 P2P 连接。**消息不经过任何服务器**，数据仅存在于您和对方的设备中，实现了真正的物理隔绝加密。

---

## ⌨️ 常用开发命令

**⚠️ 重要：本项目使用 `yarn` 作为包管理器,不要使用 npm!**

### 包管理
- **安装依赖**: `yarn install`
- **添加包**: `yarn add <package>`
- **删除包**: `yarn remove <package>`

### 安卓 (Android)
- **运行应用**: `yarn android`
- **清理构建**: `cd android && ./gradlew clean`
- **打包 APK**: `cd android && ./gradlew assembleRelease`
- **停止 Gradle 守护进程**: `cd android && ./gradlew --stop`

### iOS
- **运行应用**: `yarn ios`
- **安装依赖**: `cd ios && pod install`

---

## ⚠️ TypeScript 配置要求 (重要)

本项目使用 **最宽松** 的 TypeScript 规则，以快速开发为优先，类型安全为次要：

- 允许使用 `any` 类型。
- 不强制类型注解。
- 不强制空值检查。
- `tsconfig.json` 已配置为关闭严格模式。

---

## 💡 开发环境注意事项

1. **包管理器**: 必须使用 `yarn`,不要使用 `npm`。
2. **react-native-svg 版本锁定**: 必须使用 `15.12.0` 版本,不要升级到 `15.13.0+`。原因是 RN 0.76.1 的 Yoga 3.0 移除了 `StyleSizeLength` API,导致新版本编译失败。
3. **Gradle 构建**: 如果遇到 `react-native-mmkv` 或 `react-native-nitro-modules` 构建失败,请检查 `NitroModulesPackage.kt` 中的 `ReactModuleInfo` 构造函数调用(RN 0.76+ 移除了命名参数支持)。
