import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../core/audio/audioEngine';
import { COURSE_LABELS, COURSE_ORDER, CourseId, GameMods } from '../core/chart/types';
import { ScoreKey, ScoreRecord, SongCatalogEntry } from '../platform/types';
import { importLocalTjaFiles, loadSongAudioBuffer } from '../services/songService';

interface SongSelectScreenProps {
  songs: SongCatalogEntry[];
  scores: Record<ScoreKey, ScoreRecord>;
  mods: GameMods;
  selectedSongId: string;
  selectedCourse: CourseId;
  onSelectSong: (songId: string) => void;
  onSelectCourse: (course: CourseId) => void;
  onUpdateMods: (mods: GameMods) => void;
  onPlay: (song: SongCatalogEntry, course: CourseId) => void;
  onRefreshSongs: (focusId?: string) => Promise<void>;
  onDeleteCustomSong: (songId: string) => Promise<void>;
  onOpenSettings: () => void;
  onBackTitle: () => void;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2, 3, 4];

export const SongSelectScreen: React.FC<SongSelectScreenProps> = ({
  songs,
  scores,
  mods,
  selectedSongId,
  selectedCourse,
  onSelectSong,
  onSelectCourse,
  onUpdateMods,
  onPlay,
  onRefreshSongs,
  onDeleteCustomSong,
  onOpenSettings,
  onBackTitle,
}) => {
  const [dragging, setDragging] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [previewMuted, setPreviewMuted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewReqId = useRef(0);

  const selectedSong = songs.find((s) => s.id === selectedSongId) ?? songs[0] ?? null;
  const availableCourses = selectedSong
    ? COURSE_ORDER.filter((c) => selectedSong.courses[c] !== undefined)
    : [];
  const activeCourse: CourseId = availableCourses.includes(selectedCourse)
    ? selectedCourse
    : (availableCourses[0] ?? 'normal');

  // Auto play song preview when selection changes
  useEffect(() => {
    const reqId = ++previewReqId.current;
    if (!selectedSong || previewMuted) {
      audioEngine.stopPreview();
      return;
    }
    const timer = window.setTimeout(async () => {
      const buf = await loadSongAudioBuffer(selectedSong);
      if (reqId === previewReqId.current && buf) {
        void audioEngine.playPreview(buf, selectedSong.demoStart);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedSong, previewMuted]);

  useEffect(() => {
    return () => {
      audioEngine.stopPreview();
    };
  }, []);

  // Keyboard navigation on song select
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (songs.length === 0) return;

      const idx = Math.max(
        0,
        songs.findIndex((s) => s.id === selectedSong?.id),
      );
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = songs[(idx - 1 + songs.length) % songs.length];
        audioEngine.playDrum('ka', 'left');
        onSelectSong(next.id);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = songs[(idx + 1) % songs.length];
        audioEngine.playDrum('ka', 'right');
        onSelectSong(next.id);
      } else if (e.key === 'ArrowLeft' && availableCourses.length > 0) {
        e.preventDefault();
        const ci = availableCourses.indexOf(activeCourse);
        const next = availableCourses[(ci - 1 + availableCourses.length) % availableCourses.length];
        audioEngine.playSynthSfx('menuMove');
        onSelectCourse(next);
      } else if (e.key === 'ArrowRight' && availableCourses.length > 0) {
        e.preventDefault();
        const ci = availableCourses.indexOf(activeCourse);
        const next = availableCourses[(ci + 1) % availableCourses.length];
        audioEngine.playSynthSfx('menuMove');
        onSelectCourse(next);
      } else if (e.key === 'Enter' && selectedSong) {
        e.preventDefault();
        audioEngine.playDrum('don', 'both');
        onPlay(selectedSong, activeCourse);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [songs, selectedSong, availableCourses, activeCourse, onSelectSong, onSelectCourse, onPlay]);

  const handleImportFiles = async (files: FileList | File[]) => {
    setImportStatus('正在解析并保存 TJA 曲包...');
    try {
      const added = await importLocalTjaFiles(files);
      audioEngine.playSynthSfx('menuDecide');
      setImportStatus(`成功导入 ${added.length} 首曲目：${added.map((a) => a.title).join('、')}`);
      await onRefreshSongs(added[0]?.id);
    } catch (err) {
      audioEngine.playSynthSfx('cancel');
      setImportStatus(err instanceof Error ? err.message : '导入失败');
    }
  };

  const bgGenreId = selectedSong ? Math.abs(selectedSong.genreId) % 7 : 0;

  return (
    <div
      className="screen song-select-screen"
      style={{
        backgroundImage: `linear-gradient(rgba(16,14,26,0.58), rgba(16,14,26,0.78)), url(/assets/img/bg/bg_genre_${bgGenreId}.png)`,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length > 0) {
          void handleImportFiles(e.dataTransfer.files);
        }
      }}
    >
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-box">松手即可导入本地 .tja 谱面与配套音频！</div>
        </div>
      )}

      <header className="top-bar">
        <div className="top-bar-left">
          <button
            className="btn-ghost"
            onClick={() => {
              audioEngine.stopPreview();
              audioEngine.playSynthSfx('cancel');
              onBackTitle();
            }}
          >
            ← 标题页
          </button>
          <h2 className="page-title">选择曲目</h2>
        </div>

        <div className="top-bar-right">
          <button
            className="btn-ghost"
            onClick={() => setPreviewMuted((v) => !v)}
            title="切换选歌试听"
          >
            {previewMuted ? '🔇 试听已关' : '🔊 试听中'}
          </button>
          <button
            className="btn-accent"
            onClick={() => fileInputRef.current?.click()}
          >
            + 导入 .tja 曲包
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".tja,.ogg,.mp3,.wav,.m4a,.flac,.webm"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleImportFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <button
            className="btn-secondary"
            onClick={() => {
              audioEngine.playSynthSfx('menuDecide');
              onOpenSettings();
            }}
          >
            ⚙ 设置与校准
          </button>
        </div>
      </header>

      {importStatus && (
        <div className="status-banner">
          <span>{importStatus}</span>
          <button className="btn-link" onClick={() => setImportStatus(null)}>
            关闭
          </button>
        </div>
      )}

      <div className="select-layout">
        {/* Left: Song list */}
        <aside className="song-list-pane">
          <div className="pane-hint">
            支持方向键选歌 · 可将本地 <code>.tja + .ogg/.mp3</code> 拖入窗口直接游玩
          </div>
          <div className="song-list">
            {songs.map((song) => {
              const active = song.id === selectedSong?.id;
              return (
                <div
                  key={song.id}
                  className={`song-item ${active ? 'song-item-active' : ''}`}
                  onClick={() => {
                    audioEngine.playDrum('ka', 'right');
                    onSelectSong(song.id);
                  }}
                >
                  <div className="song-item-main">
                    <div className="song-item-title">
                      {song.title}
                      {song.source === 'custom' && <span className="tag-custom">自导入</span>}
                    </div>
                    <div className="song-item-sub">
                      {song.subtitle || song.genre} · BPM {song.bpm}
                    </div>
                  </div>
                  <div className="song-item-badges">
                    {COURSE_ORDER.filter((c) => song.courses[c] !== undefined).map((c) => {
                      const rec = scores[`${song.id}::${c}`];
                      const crownIcon =
                        rec?.crown === 'donderful'
                          ? '👑'
                          : rec?.crown === 'fullcombo'
                            ? '🥈'
                            : rec?.crown === 'clear'
                              ? '●'
                              : '';
                      return (
                        <span
                          key={c}
                          className="mini-course-dot"
                          style={{ backgroundColor: COURSE_LABELS[c].color }}
                          title={`${COURSE_LABELS[c].zh} ★${song.courses[c]}`}
                        >
                          {crownIcon || song.courses[c]}
                        </span>
                      );
                    })}
                    {song.source === 'custom' && (
                      <button
                        className="btn-delete-song"
                        title="删除自定义曲目"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDeleteCustomSong(song.id);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right: Detail, difficulties & mods */}
        <section className="song-detail-pane">
          {selectedSong ? (
            <>
              <div className="detail-header">
                <span className="genre-chip">{selectedSong.genre}</span>
                <h3 className="detail-title">{selectedSong.title}</h3>
                <p className="detail-sub">
                  {selectedSong.subtitle} · BPM {selectedSong.bpm}
                </p>
              </div>

              <div className="course-grid">
                {availableCourses.map((cId) => {
                  const info = COURSE_LABELS[cId];
                  const level = selectedSong.courses[cId] ?? 1;
                  const isSel = cId === activeCourse;
                  const best = scores[`${selectedSong.id}::${cId}`];
                  return (
                    <button
                      key={cId}
                      className={`course-card ${isSel ? 'course-card-active' : ''}`}
                      style={{ borderColor: isSel ? '#ffd84d' : info.color }}
                      onClick={() => {
                        audioEngine.playSynthSfx('menuMove');
                        onSelectCourse(cId);
                      }}
                    >
                      <div
                        className="course-sprite"
                        style={{
                          backgroundPosition: `0 -${info.iconIndex * 48}px`,
                        }}
                      />
                      <div className="course-name" style={{ color: info.color }}>
                        {info.zh}
                      </div>
                      <div className="course-stars">★ {level}</div>
                      <div className="course-best">
                        {best ? (
                          <>
                            <span>
                              {best.crown === 'donderful'
                                ? '👑 全良'
                                : best.crown === 'fullcombo'
                                  ? '🥈 全连'
                                  : best.crown === 'clear'
                                    ? '✓ 过关'
                                    : '未过关'}
                            </span>
                            <strong>{best.score.toLocaleString()}</strong>
                          </>
                        ) : (
                          <span className="muted">尚无记录</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Mods panel */}
              <div className="mods-panel">
                <div className="mods-title">演奏模组（可选）</div>
                <div className="mods-row">
                  <label className="mod-group">
                    <span>倍速</span>
                    <div className="speed-pills">
                      {SPEED_OPTIONS.map((sp) => (
                        <button
                          key={sp}
                          className={`pill-btn ${mods.speed === sp ? 'pill-btn-on' : ''}`}
                          onClick={() => onUpdateMods({ ...mods, speed: sp })}
                        >
                          {sp}x
                        </button>
                      ))}
                    </div>
                  </label>

                  <button
                    className={`pill-btn ${mods.autoPlay ? 'pill-btn-on' : ''}`}
                    onClick={() => onUpdateMods({ ...mods, autoPlay: !mods.autoPlay })}
                  >
                    🤖 AUTO 自动
                  </button>
                  <button
                    className={`pill-btn ${mods.doron ? 'pill-btn-on' : ''}`}
                    onClick={() => onUpdateMods({ ...mods, doron: !mods.doron })}
                  >
                    👻 隐身
                  </button>
                  <button
                    className={`pill-btn ${mods.swap ? 'pill-btn-on' : ''}`}
                    onClick={() => onUpdateMods({ ...mods, swap: !mods.swap })}
                  >
                    ⇄ 咚咔反转
                  </button>
                  <button
                    className={`pill-btn ${mods.donOnly ? 'pill-btn-on' : ''}`}
                    onClick={() =>
                      onUpdateMods({ ...mods, donOnly: !mods.donOnly, katOnly: false })
                    }
                  >
                    🔴 仅咚
                  </button>
                  <button
                    className={`pill-btn ${mods.katOnly ? 'pill-btn-on' : ''}`}
                    onClick={() =>
                      onUpdateMods({ ...mods, katOnly: !mods.katOnly, donOnly: false })
                    }
                  >
                    🔵 仅咔
                  </button>
                </div>
              </div>

              <div className="detail-cta">
                <button
                  className="btn-primary btn-xl"
                  onClick={() => {
                    audioEngine.stopPreview();
                    audioEngine.playDrum('don', 'both');
                    void audioEngine.playVoice('v_start');
                    onPlay(selectedSong, activeCourse);
                  }}
                >
                  🥁 开始演奏（{COURSE_LABELS[activeCourse].zh} ★{selectedSong.courses[activeCourse]}）
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">暂无曲目，请拖入本地 .tja 文件</div>
          )}
        </section>
      </div>
    </div>
  );
};
