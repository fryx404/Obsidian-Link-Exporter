import { App, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from 'obsidian';

// ─── 設定 ──────────────────────────────────────────

interface LinkExporterSettings {
    defaultExportDir: string;
    defaultMaxDepth: number;
    exportOutsideVault: boolean;
}

const DEFAULT_SETTINGS: LinkExporterSettings = {
    defaultExportDir: 'output',
    defaultMaxDepth: 2,
    exportOutsideVault: false,
};

// ─── プラグイン本体 ────────────────────────────────

export default class LinkExporterPlugin extends Plugin {
    settings: LinkExporterSettings;

    async onload() {
        await this.loadSettings();

        // リボンアイコン（サイドバー）
        this.addRibbonIcon('folder-output', 'Export linked files', () => {
            this.openExportModal();
        });

        // コマンドパレット
        this.addCommand({
            id: 'export-linked-files',
            name: 'Export linked files',
            callback: () => {
                this.openExportModal();
            },
        });

        // ファイルエクスプローラーのコンテキストメニュー（単一選択）
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
                menu.addItem((item) => {
                    item.setTitle('Export linked files')
                        .setIcon('folder-output')
                        .onClick(() => {
                            this.openExportModal([file]);
                        });
                });
            })
        );

        // ファイルエクスプローラーのコンテキストメニュー（複数選択）
        this.registerEvent(
            this.app.workspace.on('files-menu', (menu: Menu, files: TAbstractFile[]) => {
                menu.addItem((item) => {
                    item.setTitle(`Export ${files.length} items`)
                        .setIcon('folder-output')
                        .onClick(() => {
                            this.openExportModal(files);
                        });
                });
            })
        );

        // 設定タブ
        this.addSettingTab(new LinkExporterSettingTab(this.app, this));
    }

    private openExportModal(files?: TAbstractFile[]) {
        let targetFiles: TFile[] = [];

        if (files && files.length > 0) {
            targetFiles = this.getMarkdownFilesInAbstractFiles(files);
        } else {
            // コマンドやリボンアイコンからの実行（引数なし）
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && activeFile.extension === 'md') {
                targetFiles = [activeFile];
            }
        }

        if (targetFiles.length === 0) {
            new Notice('エクスポート対象のMarkdownファイルが見つかりません。');
            return;
        }

        new ExportModal(this.app, this, targetFiles).open();
    }

    private getMarkdownFilesInAbstractFiles(files: TAbstractFile[]): TFile[] {
        const mdFiles: TFile[] = [];
        for (const file of files) {
            if (file instanceof TFile && file.extension === 'md') {
                mdFiles.push(file);
            } else if (file instanceof TFolder) {
                // フォルダ内のファイルを再帰的に取得
                const children = this.getMarkdownFilesInAbstractFiles(file.children);
                mdFiles.push(...children);
            }
        }
        // 重複排除
        return Array.from(new Set(mdFiles));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// ─── エクスポートモーダル ──────────────────────────

class ExportModal extends Modal {
    plugin: LinkExporterPlugin;
    sourceFiles: TFile[];
    maxDepth: number;
    exportDir: string;
    exportOutsideVault: boolean;
    statusEl: HTMLElement;

    constructor(app: App, plugin: LinkExporterPlugin, sourceFiles: TFile[]) {
        super(app);
        this.plugin = plugin;
        this.sourceFiles = sourceFiles;
        this.maxDepth = plugin.settings.defaultMaxDepth;
        this.exportDir = plugin.settings.defaultExportDir;
        this.exportOutsideVault = plugin.settings.exportOutsideVault;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('link-exporter-modal');

        // ヘッダー
        contentEl.createEl('h2', { text: 'Export Linked Files' });

        const sourceText = this.sourceFiles.length === 1 
            ? `ソース: ${this.sourceFiles[0].basename}` 
            : `ソース: ${this.sourceFiles[0].basename} など計 ${this.sourceFiles.length} 件`;

        contentEl.createEl('p', {
            text: sourceText,
            cls: 'link-exporter-source',
        });

        // 階層数スライダー
        const depthSetting = new Setting(contentEl)
            .setName('探索階層')
            .setDesc('0 = このファイルのみ、1 = 直接リンク先、2+ = リンク先のリンク先...');

        const depthValueEl = depthSetting.controlEl.createEl('span', {
            text: String(this.maxDepth),
            cls: 'link-exporter-depth-value',
        });

        depthSetting.addSlider((slider) =>
            slider
                .setLimits(0, 10, 1)
                .setValue(this.maxDepth)
                .setDynamicTooltip()
                .onChange((value) => {
                    this.maxDepth = value;
                    depthValueEl.setText(String(value));
                })
        );

        // 保存先セクション
        const exportModeToggle = new Setting(contentEl)
            .setName('保管庫外に保存')
            .setDesc('ONにすると、デスクトップやDocumentsなど保管庫外のフォルダを選択できます');

        exportModeToggle.addToggle((toggle) =>
            toggle
                .setValue(this.exportOutsideVault)
                .onChange((value) => {
                    this.exportOutsideVault = value;
                    this.renderExportDirSetting(exportDirContainer);
                })
        );

        const exportDirContainer = contentEl.createDiv('link-exporter-dir-container');
        this.renderExportDirSetting(exportDirContainer);

        // エクスポートボタン
        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('エクスポート')
                    .setCta()
                    .onClick(async () => {
                        btn.setDisabled(true);
                        btn.setButtonText('処理中...');
                        await this.runExport();
                        btn.setDisabled(false);
                        btn.setButtonText('エクスポート');
                    })
            );

        // ステータス表示エリア
        this.statusEl = contentEl.createEl('div', {
            cls: 'link-exporter-status',
            text: '待機中',
        });
    }

    private renderExportDirSetting(container: HTMLElement) {
        container.empty();

        if (this.exportOutsideVault) {
            // 保管庫外: フォルダ選択ダイアログ
            const pathDisplay = container.createEl('div', { cls: 'link-exporter-path-display' });
            pathDisplay.setText(this.exportDir || '未選択');

            const browseBtn = container.createEl('button', {
                text: 'フォルダを選択...',
                cls: 'link-exporter-browse-btn',
            });
            browseBtn.addEventListener('click', async () => {
                try {
                    const electron = (window as any).require('electron');
                    const result = await electron.remote.dialog.showOpenDialog({
                        properties: ['openDirectory', 'createDirectory'],
                        title: 'エクスポート先フォルダを選択',
                    });
                    if (!result.canceled && result.filePaths.length > 0) {
                        this.exportDir = result.filePaths[0];
                        pathDisplay.setText(this.exportDir);
                    }
                } catch (e) {
                    new Notice('フォルダ選択ダイアログを開けませんでした。');
                    console.error('Link Exporter: Failed to open folder dialog', e);
                }
            });
        } else {
            // 保管庫内: テキスト入力
            new Setting(container)
                .setName('保存先フォルダ')
                .setDesc('保管庫内のフォルダパス')
                .addText((text) =>
                    text
                        .setPlaceholder('output')
                        .setValue(this.exportDir)
                        .onChange((value) => {
                            this.exportDir = value;
                        })
                );
        }
    }

    private async runExport() {
        const processedPaths = new Set<string>();
        let count = 0;

        const updateStatus = (msg: string) => {
            this.statusEl.setText(msg);
        };

        if (this.exportOutsideVault) {
            // ── 保管庫外エクスポート（Node.js fs） ──
            const fs = (window as any).require('fs');
            const path = (window as any).require('path');
            const exportPath = this.exportDir;

            if (!fs.existsSync(exportPath)) {
                fs.mkdirSync(exportPath, { recursive: true });
            }

            const exportRecursive = async (file: TFile, depth: number) => {
                if (!file || file.extension !== 'md' || depth > this.maxDepth || processedPaths.has(file.path)) {
                    return;
                }
                processedPaths.add(file.path);

                const content = await this.app.vault.read(file);
                const destPath = path.join(exportPath, file.name);
                fs.writeFileSync(destPath, content, 'utf-8');
                count++;
                updateStatus(`処理中... ${count} ファイル`);

                const metadata = this.app.metadataCache.getFileCache(file);
                const links = metadata?.links || [];
                for (const link of links) {
                    const targetFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                    if (targetFile && targetFile instanceof TFile) {
                        await exportRecursive(targetFile, depth + 1);
                    }
                }
            };

            for (const file of this.sourceFiles) {
                await exportRecursive(file, 0);
            }
            updateStatus(`完了: ${count} ファイルを ${exportPath} にエクスポートしました`);
            new Notice(`${count} 個のファイルを ${exportPath} にエクスポートしました`);

        } else {
            // ── 保管庫内エクスポート（Vault API） ──
            const exportDirName = this.exportDir || 'output';
            const exportFolder = this.app.vault.getAbstractFileByPath(exportDirName);
            if (!exportFolder) {
                await this.app.vault.createFolder(exportDirName);
            }

            const exportRecursive = async (file: TFile, depth: number) => {
                if (!file || file.extension !== 'md' || depth > this.maxDepth || processedPaths.has(file.path)) {
                    return;
                }
                processedPaths.add(file.path);

                const content = await this.app.vault.read(file);
                const destPath = `${exportDirName}/${file.name}`;
                const existingFile = this.app.vault.getAbstractFileByPath(destPath);

                if (!existingFile) {
                    await this.app.vault.create(destPath, content);
                } else if (existingFile instanceof TFile) {
                    await this.app.vault.modify(existingFile, content);
                }
                count++;
                updateStatus(`処理中... ${count} ファイル`);

                const metadata = this.app.metadataCache.getFileCache(file);
                const links = metadata?.links || [];
                for (const link of links) {
                    const targetFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                    if (targetFile && targetFile instanceof TFile) {
                        await exportRecursive(targetFile, depth + 1);
                    }
                }
            };

            for (const file of this.sourceFiles) {
                await exportRecursive(file, 0);
            }
            updateStatus(`完了: ${count} ファイルを ${exportDirName} にエクスポートしました`);
            new Notice(`${count} 個のファイルを ${exportDirName} にエクスポートしました`);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// ─── 設定タブ ──────────────────────────────────────

class LinkExporterSettingTab extends PluginSettingTab {
    plugin: LinkExporterPlugin;

    constructor(app: App, plugin: LinkExporterPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Link Exporter 設定' });

        new Setting(containerEl)
            .setName('デフォルト保存先フォルダ')
            .setDesc('エクスポート先のデフォルトパス')
            .addText((text) =>
                text
                    .setPlaceholder('output')
                    .setValue(this.plugin.settings.defaultExportDir)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultExportDir = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('デフォルト探索階層')
            .setDesc('リンクを辿る階層数のデフォルト値（0〜10）')
            .addSlider((slider) =>
                slider
                    .setLimits(0, 10, 1)
                    .setValue(this.plugin.settings.defaultMaxDepth)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.defaultMaxDepth = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('保管庫外に保存（デフォルト）')
            .setDesc('ONにすると、モーダルのデフォルトが保管庫外エクスポートになります')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.exportOutsideVault)
                    .onChange(async (value) => {
                        this.plugin.settings.exportOutsideVault = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
