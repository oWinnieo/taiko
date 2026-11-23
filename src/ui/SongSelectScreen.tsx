import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../core/audio/audioEngine';
import { COURSE_LABELS, COURSE_ORDER, CourseId, GameMods } from '../core/chart/types';
import { useDrumMenuInput } from '../core/input/useDrumMenuInput';
import { KeyBindings, ScoreKey, ScoreRecord, SongCatalogEntry } from '../platform/types';
import { importLocalTjaFiles, loadSongAudioBuffer } from '../services/songService';

interface SongSelectScreenProps {
  songs: SongCatalogEntry[];
  scores: Record<ScoreKey, ScoreRecord>;
  mods: GameMods;
  keyBindings: KeyBindings;
  menuDisabled?: boolean;
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
  keyBindings,
  menuDisabled = false,
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
  // Switch-style two-stage selection: 'song' -> hit Don -> 'course' (Back or difficulty) -> hit Don -> Play!
  const [stage, setStage] = useState<'song' | 'course'>('song');
  const [courseCursor, setCourseCursor] = useState<number>(1); // 0 = Back to song list, 1..N = availableCourses

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewReqId = useRef(0);
  const activeSongItemRef = useRef<HTMLDivElement | null>(null);

  const selectedSong = songs.find((s) => s.id === selectedSongId) ?? songs[0] ?? null;
  const availableCourses = selectedSong
    ? COURSE_ORDER.filter((c) => selectedSong.courses[c] !== undefined)
    : [];
  const activeCourse: CourseId = availableCourses.includes(selectedCourse)
    ? selectedCourse
    : (availableCourses[0] ?? 'normal');

  // Keep selected song scrolled into view when navigating by drum
  useEffect(() => {
    activeSongItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedSong?.id]);

  // Sync courseCursor when entering course stage
  const enterCourseStage = () => {
    if (!selectedSong || availableCourses.length === 0) return;
    const idx = availableCourses.indexOf(activeCourse);
    setCourseCursor(idx >= 0 ? idx + 1 : 1);
    setStage('course');
    void audioEngine.playVoice('v_diffsel');
  };

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

  const startSelectedCourse = (courseToPlay: CourseId) => {
    if (!selectedSong) return;
    audioEngine.stopPreview();
    void audioEngine.playVoice('v_start');
    onPlay(selectedSong, courseToPlay);
  };

  // Switch-style TaTaCon & Keyboard menu navigation
  const gamepads = useDrumMenuInput({
    enabled: !menuDisabled,
    keyBindings,
    graceMs: 200,
    onPrev: () => {
      if (stage === 'song') {
        if (songs.length === 0) return;
        const idx = Math.max(
          0,
          songs.findIndex((s) => s.id === selectedSong?.id),
        );
        const prev = songs[(idx - 1 + songs.length) % songs.length];
        onSelectSong(prev.id);
      } else {
        const total = availableCourses.length + 1; // index 0 = Back
        const nextIdx = (courseCursor - 1 + total) % total;
        setCourseCursor(nextIdx);
        if (nextIdx > 0) {
          onSelectCourse(availableCourses[nextIdx - 1]);
        }
      }
    },
    onNext: () => {
      if (stage === 'song') {
        if (songs.length === 0) return;
        const idx = Math.max(
          0,
          songs.findIndex((s) => s.id === selectedSong?.id),
        );
        const next = songs[(idx + 1) % songs.length];
        onSelectSong(next.id);
      } else {
        const total = availableCourses.length + 1;
        const nextIdx = (courseCursor + 1) % total;
        setCourseCursor(nextIdx);
        if (nextIdx > 0) {
          onSelectCourse(availableCourses[nextIdx - 1]);
        }
      }
    },
    onConfirm: () => {
      if (stage === 'song') {
        enterCourseStage();
      } else {
        if (courseCursor === 0) {
          setStage('song');
        } else {
          const chosen = availableCourses[courseCursor - 1] ?? activeCourse;
          onSelectCourse(chosen);
          startSelectedCourse(chosen);
        }
      }
    },
    onCancel: () => {
      if (stage === 'course') {
        setStage('song');
      } else {
        audioEngine.stopPreview();
        onBackTitle();
      }
    },
  });

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
          <h2 className="page-title">
            {stage === 'song' ? '第一步：选择曲目' : '第二步：选择难度'}
          </h2>
          {gamepads.length > 0 && (
            <span className="festival-pill pill-drum">🥁 外设已连接</span>
          )}
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
        <aside className={`song-list-pane ${stage === 'song' ? 'pane-stage-active' : 'pane-stage-dim'}`}>
          <div className="pane-hint">
            {stage === 'song'
              ? '🔵 左/右咔切歌 · 🔴 咚进入选难度 · 可拖入本地 .tja 曲包'
              : '正在选择右侧难度（敲「返回选歌」可回到列表）'}
          </div>
          <div className="song-list">
            {songs.map((song) => {
              const active = song.id === selectedSong?.id;
              return (
                <div
                  key={song.id}
                  ref={active ? activeSongItemRef : null}
                  className={`song-item ${active ? 'song-item-active' : ''} ${active && stage === 'song' ? 'drum-focused' : ''}`}
                  onClick={() => {
                    audioEngine.playDrum('ka', 'right');
                    setStage('song');
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
        <section className={`song-detail-pane ${stage === 'course' ? 'pane-stage-active' : ''}`}>
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
                {/* Slot 0 in course stage: Return to song list (just like NS/Arcade) */}
                <button
                  className={`course-card course-back-card ${stage === 'course' && courseCursor === 0 ? 'course-card-active drum-focused' : ''}`}
                  onClick={() => {
                    audioEngine.playSynthSfx('cancel');
                    setStage('song');
                  }}
                >
                  <div className="course-back-icon">↩</div>
                  <div className="course-name">返回选歌</div>
                  <div className="course-best">
                    <span className="muted">敲咚回到曲目列表</span>
                  </div>
                </button>

                {availableCourses.map((cId, idx) => {
                  const info = COURSE_LABELS[cId];
                  const level = selectedSong.courses[cId] ?? 1;
                  const isFocused = stage === 'course' && courseCursor === idx + 1;
                  const isSel = cId === activeCourse;
                  const best = scores[`${selectedSong.id}::${cId}`];
                  return (
                    <button
                      key={cId}
                      className={`course-card ${isSel ? 'course-card-active' : ''} ${isFocused ? 'drum-focused' : ''}`}
                      style={{ borderColor: isFocused ? '#ffd84d' : isSel ? '#ffd84d' : info.color }}
                      onClick={() => {
                        audioEngine.playSynthSfx('menuMove');
                        onSelectCourse(cId);
                        setCourseCursor(idx + 1);
                        setStage('course');
                      }}
                      onDoubleClick={() => {
                        audioEngine.playDrum('don', 'both');
                        startSelectedCourse(cId);
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
                <div className="drum-nav-hint">
                  {stage === 'song'
                    ? '🥁 鼓操作：左/右咔切换曲目 · 咚确认选难度'
                    : courseCursor === 0
                      ? '🥁 鼓操作：右咔选难度 · 咚返回选歌列表'
                      : '🥁 鼓操作：左/右咔切换难度 · 咚直接开打！'}
                </div>
                <button
                  className="btn-primary btn-xl"
                  onClick={() => {
                    audioEngine.playDrum('don', 'both');
                    startSelectedCourse(activeCourse);
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
