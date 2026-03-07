# Obsidian Link Exporter

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Obsidianのリンク（MOC等）をたどり、再帰的にファイルをエクスポートするためのプラグインです。
指定した階層までリンク先のMarkdownファイルを抽出し、保管庫（Vault）内または保管庫外（デスクトップなど）の指定フォルダに出力します。

## 特徴

- **再帰的エクスポート** — 対象ファイルからリンクされているファイルを指定した階層数（0〜10）まで再帰的に抽出
- **保管庫外への保存対応** — Obsidianの保管庫内だけでなく、ローカルの任意のフォルダにエクスポート可能
- **簡単な操作** — リボンアイコンやコマンドパレットから直感的にエクスポートを実行

## 使い方

### インストール

1. [Releases](https://github.com/fryx404/Obsidian-Link-Exporter/releases) から `main.js`、`manifest.json`、`styles.css` をダウンロード
2. Vault内に `.obsidian/plugins/obsidian-link-exporter/` フォルダを作成し、3ファイルを配置
3. Obsidianを再起動 → 設定 → コミュニティプラグイン で有効化

### エクスポートの実行

1. エクスポートの起点となるファイルを開く。
2. 左側のリボンアイコン（フォルダアイコン）、またはコマンドパレットから「Export linked files」を実行。
3. エクスポート設定用のモーダルが開くので、探索階層（Depth）と保存先を設定する。
4. 「エクスポート」をクリックして実行。

## バージョン履歴

### v1.0.0

- 初回リリース
- リンクの再帰的エクスポート機能
- 保管庫内外への出力機能
- エクスポート設定モーダルの実装

## ライセンス

[MIT](LICENSE)
