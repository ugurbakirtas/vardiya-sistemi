import sys
import json
import os
import vlc

from PyQt6.QtWidgets import (
    QApplication,
    QMainWindow,
    QWidget,
    QGridLayout,
    QVBoxLayout,
    QHBoxLayout,
    QListWidget,
    QLabel,
    QPushButton,
    QLineEdit,
    QMessageBox,
)
from PyQt6.QtCore import Qt, QTimer


PLUGIN_PATH = "C:/msys64/mingw64/lib/vlc/plugins"
PRESET_FILE = "preset.json"


class VideoWidget(QWidget):
    def __init__(self, name: str, url: str):
        super().__init__()

        self.name = name
        self.url = url
        self.started = False

        self.setStyleSheet("background:black; border:2px solid #333;")

        self.instance = vlc.Instance(
            "--no-audio",
            "--network-caching=150",
            f"--plugin-path={PLUGIN_PATH}"
        )
        self.player = self.instance.media_player_new()

        self.overlay = QLabel(self)
        self.overlay.setStyleSheet("""
            background-color: rgba(0, 0, 0, 120);
            color: white;
            font-size: 13px;
            padding: 4px;
        """)
        self.overlay.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        self.overlay.setText(f"{self.name}\n{self.url}")
        self.overlay.raise_()

        self.set_selected(False)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.overlay.setGeometry(0, 0, self.width(), 44)

    def start(self):
        try:
            media = self.instance.media_new(self.url)
            self.player.set_media(media)

            if sys.platform.startswith("win"):
                self.player.set_hwnd(int(self.winId()))

            self.player.play()
            self.started = True
        except Exception:
            self.started = False

    def stop(self):
        try:
            self.player.stop()
        except Exception:
            pass
        self.started = False

    def restart(self):
        self.stop()
        QTimer.singleShot(200, self.start)

    def update_info(self, name: str, url: str):
        self.name = name
        self.url = url
        self.overlay.setText(f"{self.name}\n{self.url}")

    def set_selected(self, selected: bool):
        if selected:
            self.setStyleSheet("background:black; border:3px solid #00c8ff;")
        else:
            self.setStyleSheet("background:black; border:2px solid #333;")


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("MV Python Pro")
        self.resize(1600, 900)

        self.channels = []
        for i in range(16):
            self.channels.append({
                "name": f"CH {i + 1}",
                "url": f"udp://@238.0.0.{i + 1}:1234"
            })

        self.video_widgets = []
        self.selected_index = 0
        self.current_rows = 4
        self.current_cols = 4
        self.audio_enabled = True
        self.initialized = False

        self.audio_instance = vlc.Instance(
            "--intf=dummy",
            "--no-video",
            "--aout=directsound",
            "--network-caching=150",
            f"--plugin-path={PLUGIN_PATH}"
        )
        self.audio_player = self.audio_instance.media_player_new()

        self._build_ui()
        self._load_preset_if_exists()
        self._load_channels_to_list()
        self._create_video_widgets()
        self._rebuild_preview_grid()

        safe_index = min(max(self.selected_index, 0), len(self.channels) - 1)
        self.channel_list.setCurrentRow(safe_index)
        self._load_selected_channel(safe_index)

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)

        root = QHBoxLayout()
        root.setContentsMargins(6, 6, 6, 6)
        root.setSpacing(6)
        central.setLayout(root)

        left_panel = QWidget()
        left_panel.setFixedWidth(280)
        left_layout = QVBoxLayout()
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(6)
        left_panel.setLayout(left_layout)

        title = QLabel("KANALLAR")
        title.setStyleSheet("font-size:18px; font-weight:bold;")
        left_layout.addWidget(title)

        self.channel_list = QListWidget()
        self.channel_list.currentRowChanged.connect(self._load_selected_channel)
        left_layout.addWidget(self.channel_list)

        left_layout.addWidget(QLabel("İsim:"))
        self.name_edit = QLineEdit()
        left_layout.addWidget(self.name_edit)

        left_layout.addWidget(QLabel("URL:"))
        self.url_edit = QLineEdit()
        left_layout.addWidget(self.url_edit)

        self.apply_btn = QPushButton("Uygula")
        self.apply_btn.clicked.connect(self._apply_channel_changes)
        left_layout.addWidget(self.apply_btn)

        self.audio_btn = QPushButton("Sesi Kapat")
        self.audio_btn.clicked.connect(self._toggle_audio)
        left_layout.addWidget(self.audio_btn)

        layout_row = QHBoxLayout()
        self.btn_2x2 = QPushButton("2x2")
        self.btn_3x3 = QPushButton("3x3")
        self.btn_4x4 = QPushButton("4x4")

        self.btn_2x2.clicked.connect(lambda: self._set_layout(2, 2))
        self.btn_3x3.clicked.connect(lambda: self._set_layout(3, 3))
        self.btn_4x4.clicked.connect(lambda: self._set_layout(4, 4))

        layout_row.addWidget(self.btn_2x2)
        layout_row.addWidget(self.btn_3x3)
        layout_row.addWidget(self.btn_4x4)
        left_layout.addLayout(layout_row)

        preset_row = QHBoxLayout()
        self.save_preset_btn = QPushButton("Preset Kaydet")
        self.load_preset_btn = QPushButton("Preset Yükle")
        self.save_preset_btn.clicked.connect(self._save_preset)
        self.load_preset_btn.clicked.connect(self._load_preset_button)

        preset_row.addWidget(self.save_preset_btn)
        preset_row.addWidget(self.load_preset_btn)
        left_layout.addLayout(preset_row)

        left_layout.addStretch()

        self.preview_area = QWidget()
        self.preview_grid = QGridLayout()
        self.preview_grid.setContentsMargins(0, 0, 0, 0)
        self.preview_grid.setSpacing(4)
        self.preview_area.setLayout(self.preview_grid)

        root.addWidget(left_panel)
        root.addWidget(self.preview_area, 1)

    def _load_channels_to_list(self):
        self.channel_list.clear()
        for ch in self.channels:
            self.channel_list.addItem(ch["name"])

    def _create_video_widgets(self):
        self.video_widgets.clear()
        for ch in self.channels:
            widget = VideoWidget(ch["name"], ch["url"])
            self.video_widgets.append(widget)

    def _clear_preview_grid(self):
        while self.preview_grid.count():
            item = self.preview_grid.takeAt(0)
            widget = item.widget()
            if widget is not None:
                self.preview_grid.removeWidget(widget)

    def _rebuild_preview_grid(self):
        self._clear_preview_grid()

        visible_count = self.current_rows * self.current_cols

        for i, widget in enumerate(self.video_widgets):
            if i < visible_count:
                row = i // self.current_cols
                col = i % self.current_cols
                self.preview_grid.addWidget(widget, row, col)
                widget.show()
            else:
                widget.hide()

    def _start_visible_streams_staged(self):
        visible_count = self.current_rows * self.current_cols

        for i in range(visible_count):
            delay = 150 * i
            QTimer.singleShot(delay, self.video_widgets[i].start)

    def _restart_visible_streams_staged(self):
        visible_count = self.current_rows * self.current_cols

        for i in range(visible_count):
            self.video_widgets[i].stop()

        for i in range(visible_count):
            delay = 150 * i
            QTimer.singleShot(delay, self.video_widgets[i].start)

    def _start_selected_audio(self):
        try:
            self.audio_player.stop()
        except Exception:
            pass

        if not self.audio_enabled:
            self.audio_btn.setText("Sesi Aç")
            return

        try:
            ch = self.channels[self.selected_index]
            media = self.audio_instance.media_new(ch["url"])
            media.add_option(":no-video")
            media.add_option(":network-caching=150")

            self.audio_player.set_media(media)
            self.audio_player.audio_set_mute(False)
            self.audio_player.audio_set_volume(100)
            self.audio_player.play()
            self.audio_btn.setText("Sesi Kapat")
        except Exception:
            pass

    def _load_selected_channel(self, index: int):
        if index < 0 or index >= len(self.channels):
            return

        self.selected_index = index
        ch = self.channels[index]

        self.name_edit.setText(ch["name"])
        self.url_edit.setText(ch["url"])

        for i, widget in enumerate(self.video_widgets):
            widget.set_selected(i == index)

        if self.initialized:
            QTimer.singleShot(300, self._start_selected_audio)

    def _apply_channel_changes(self):
        idx = self.selected_index
        if idx < 0 or idx >= len(self.channels):
            return

        self.channels[idx]["name"] = self.name_edit.text().strip() or f"CH {idx + 1}"
        self.channels[idx]["url"] = self.url_edit.text().strip() or f"udp://@238.0.0.{idx + 1}:1234"

        self.channel_list.item(idx).setText(self.channels[idx]["name"])

        self.video_widgets[idx].update_info(
            self.channels[idx]["name"],
            self.channels[idx]["url"]
        )
        self.video_widgets[idx].restart()

        if idx == self.selected_index:
            QTimer.singleShot(700, self._start_selected_audio)

    def _set_layout(self, rows: int, cols: int):
        self.current_rows = rows
        self.current_cols = cols
        self._rebuild_preview_grid()
        self._restart_visible_streams_staged()
        QTimer.singleShot(1000, self._start_selected_audio)

    def _toggle_audio(self):
        self.audio_enabled = not self.audio_enabled

        if self.audio_enabled:
            self._start_selected_audio()
        else:
            try:
                self.audio_player.stop()
            except Exception:
                pass
            self.audio_btn.setText("Sesi Aç")

    def _save_preset(self):
        data = {
            "channels": self.channels,
            "selected_index": self.selected_index,
            "current_rows": self.current_rows,
            "current_cols": self.current_cols,
            "audio_enabled": self.audio_enabled,
        }

        try:
            with open(PRESET_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            QMessageBox.information(self, "Bilgi", "Preset kaydedildi.")
        except Exception as e:
            QMessageBox.critical(self, "Hata", f"Preset kaydedilemedi:\n{e}")

    def _load_preset_if_exists(self):
        if not os.path.exists(PRESET_FILE):
            return

        try:
            with open(PRESET_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)

            loaded_channels = data.get("channels")
            if isinstance(loaded_channels, list) and len(loaded_channels) == 16:
                self.channels = loaded_channels

            self.selected_index = int(data.get("selected_index", 0))
            self.current_rows = int(data.get("current_rows", 4))
            self.current_cols = int(data.get("current_cols", 4))
            self.audio_enabled = bool(data.get("audio_enabled", True))
        except Exception:
            pass

    def _load_preset_button(self):
        self._load_preset_if_exists()

        for widget in self.video_widgets:
            widget.stop()

        self._load_channels_to_list()

        for i, ch in enumerate(self.channels):
            self.video_widgets[i].update_info(ch["name"], ch["url"])

        self._rebuild_preview_grid()

        safe_index = min(max(self.selected_index, 0), len(self.channels) - 1)
        self.channel_list.setCurrentRow(safe_index)
        self._load_selected_channel(safe_index)

        self._restart_visible_streams_staged()
        QTimer.singleShot(1200, self._start_selected_audio)

        QMessageBox.information(self, "Bilgi", "Preset yüklendi.")

    def showEvent(self, event):
        super().showEvent(event)

        if not self.initialized:
            self.initialized = True
            QTimer.singleShot(300, self._start_visible_streams_staged)
            QTimer.singleShot(1500, self._start_selected_audio)

    def closeEvent(self, event):
        for widget in self.video_widgets:
            widget.stop()

        try:
            self.audio_player.stop()
        except Exception:
            pass

        super().closeEvent(event)


if __name__ == "__main__":
    app = QApplication(sys.argv)

    window = MainWindow()
    window.show()

    sys.exit(app.exec())