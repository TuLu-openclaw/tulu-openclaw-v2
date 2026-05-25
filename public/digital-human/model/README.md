# OpenClaw 数字人模型目录

方案 C 使用这里的本地模型进行售卖版打包。

当前文件：

- `openclaw-avatar.glb`
  - 来源：three.js examples `examples/models/gltf/Xbot.glb`
  - 仓库：https://github.com/mrdoob/three.js
  - 许可：three.js 仓库 MIT License（见 `THREEJS-MIT-LICENSE.txt`）
  - 说明：这是免费 GLB 测试/临时模型，用于打通本地 3D 数字人加载链路；不是最终真人级商业数字人。

后续替换规则：

1. 如获得更高质量且可商用再分发的模型，替换为同名 `openclaw-avatar.glb` 即可。
2. 必须保留对应 LICENSE / 来源说明。
3. 不要提交来源不明、禁止再分发的模型。
4. 模型不存在或加载失败时，OpenClaw 主聊天页会自动回退到 `public/digital-human/openclaw-avatar.svg`，不会影响应用启动。
