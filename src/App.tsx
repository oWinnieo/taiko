import React, { useCallback, useEffect, useState } from 'react';
import { audioEngine } from './core/audio/audioEngine';
import { CourseId, DEFAULT_MODS, GameMods, PlayableChart } from './core/chart/types';
import { GameResultSummary } from './core/engine/gameEngine';
import { GameSettings, ScoreKey, ScoreRecord, SongCatalogEntry } from './platform/types';
import { platform } from './platform/webPlatform';
import { loadAllSongs, loadPlayableSong } from './services/songService';
import { PlayScreen } from './ui/PlayScreen';
import { ResultScreen } from './ui/ResultScreen';
import { SettingsModal } from './ui/SettingsModal';
import { SongSelectScreen } from './ui/SongSelectScreen';
import { TitleScreen } from './ui/TitleScreen';

type ScreenState =
  | { view: 'title' }
  | { view: 'select' }
  | {
      view: 'play';
      song: SongCatalogEntry;
      courseId: CourseId;
      chart: PlayableChart;
      audioBuffer: AudioBuffer | null;
      runId: number;
    }
  | {
      view: 'result';
      song: SongCatalogEntry;
      courseId: CourseId;
      result: GameResultSummary;
      isNewRecord: boolean;
    };

export const App: React.FC = () => {
  const [screen, setScreen] = useState<ScreenState>({ view: 'title' });
  const [songs, setSongs] = useState<SongCatalogEntry[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<CourseId>('normal');
  const [mods, setMods] = useState<GameMods>({ ...DEFAULT_MODS });
  const [settings, setSettings] = useState<GameSettings>(() => platform.loadSettings());
  const [scores, setScores] = useState<Record<ScoreKey, ScoreRecord>>(() => platform.loadScores());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshSongs = useCallback(async (focusId?: string) => {
    const list = await loadAllSongs();
    setSongs(list);
    if (focusId) {
      setSelectedSongId(focusId);
    } else if (list.length > 0) {
      setSelectedSongId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0].id));
    }
  }, []);

  useEffect(() => {
    void refreshSongs();
  }, [refreshSongs]);

  useEffect(() => {
    audioEngine.setVolumes(settings.musicVolume, settings.sfxVolume, settings.voiceVolume);
    platform.saveSettings(settings);
  }, [settings]);

  const handleEnterSelect = async () => {
    await audioEngine.loadDrumPack(settings.drumPack);
    setScreen({ view: 'select' });
    void audioEngine.playVoice('v_songsel');
  };

  const handlePlay = useCallback(
    async (song: SongCatalogEntry, courseId: CourseId) => {
      setLoadingMsg(`正在加载「${song.title}」...`);
      setErrorMsg(null);
      try {
        await audioEngine.loadDrumPack(settings.drumPack);
        const { chart, audioBuffer } = await loadPlayableSong(song, courseId, mods);
        setScreen({
          view: 'play',
          song,
          courseId: chart.courseId,
          chart,
          audioBuffer,
          runId: Date.now(),
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : '加载曲目失败');
      } finally {
        setLoadingMsg(null);
      }
    },
    [mods, settings.drumPack],
  );

  const handleFinishPlay = useCallback(
    (song: SongCatalogEntry, courseId: CourseId, result: GameResultSummary) => {
      const key: ScoreKey = `${song.id}::${courseId}`;
      const prevBest = scores[key]?.score ?? 0;
      let isNewRecord = false;
      if (!result.autoUsed) {
        isNewRecord = result.score > prevBest;
        platform.saveScore({
          songId: song.id,
          courseId,
          score: result.score,
          good: result.good,
          ok: result.ok,
          bad: result.bad,
          maxCombo: result.maxCombo,
          drumrollHits: result.drumrollHits,
          crown: result.crown,
          updatedAt: Date.now(),
        });
        setScores(platform.loadScores());
      }
      setScreen({ view: 'result', song, courseId, result, isNewRecord });
    },
    [scores],
  );

  const handleDeleteCustomSong = async (songId: string) => {
    await platform.deleteCustomSong(songId);
    await refreshSongs();
  };

  return (
    <div className="app-root">
      {screen.view === 'title' && (
        <TitleScreen
          onStart={() => void handleEnterSelect()}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {screen.view === 'select' && (
        <SongSelectScreen
          songs={songs}
          scores={scores}
          mods={mods}
          selectedSongId={selectedSongId}
          selectedCourse={selectedCourse}
          onSelectSong={setSelectedSongId}
          onSelectCourse={setSelectedCourse}
          onUpdateMods={setMods}
          onPlay={(song, course) => void handlePlay(song, course)}
          onRefreshSongs={refreshSongs}
          onDeleteCustomSong={handleDeleteCustomSong}
          onOpenSettings={() => setSettingsOpen(true)}
          onBackTitle={() => setScreen({ view: 'title' })}
        />
      )}

      {screen.view === 'play' && (
        <PlayScreen
          key={screen.runId}
          chart={screen.chart}
          audioBuffer={screen.audioBuffer}
          genreId={screen.song.genreId}
          mods={mods}
          settings={settings}
          onFinish={(res) => handleFinishPlay(screen.song, screen.courseId, res)}
          onRestart={() => void handlePlay(screen.song, screen.courseId)}
          onExit={() => setScreen({ view: 'select' })}
        />
      )}

      {screen.view === 'result' && (
        <ResultScreen
          song={screen.song}
          courseId={screen.courseId}
          result={screen.result}
          isNewRecord={screen.isNewRecord}
          onRetry={() => void handlePlay(screen.song, screen.courseId)}
          onBackSelect={() => setScreen({ view: 'select' })}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {loadingMsg && (
        <div className="modal-backdrop">
          <div className="loading-pill">{loadingMsg}</div>
        </div>
      )}

      {errorMsg && (
        <div className="toast-error">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}>✕</button>
        </div>
      )}
    </div>
  );
};
