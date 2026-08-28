import {
  backupStatus,
  chooseBackupFolder,
  finishTimerSession,
  flushAutoBackup,
  getState,
  getTimerSession,
  importBackupFile,
  initStore,
  pauseTimerSession,
  startTimerSession,
  subscribe,
  writeBackupNow,
} from "./storage/store.js";
import { formatHMS, getTimer } from "./storage/session.js";

const statusEl = document.getElementById("backup-status");
const platformEl = document.getElementById("platform-hint");
const statsEl = document.getElementById("state-stats");
const timerDisplayEl = document.getElementById("timer-display");
const timerMetaEl = document.getElementById("timer-meta");

let tickId = null;

function formatBackupStatus() {
  const s = backupStatus();
  if (!s.folderName) {
    return "Nenhuma pasta de backup definida neste aparelho.";
  }
  if (!s.lastBackupAt) {
    return 'Pasta: "' + s.folderName + '". Ainda não houve backup gravado.';
  }
  const days = Math.floor((Date.now() - s.lastBackupAt) / 86400000);
  const when =
    days === 0
      ? "hoje"
      : days === 1
        ? "há 1 dia"
        : "há " + days + " dias";
  return 'Pasta: "' + s.folderName + '". Último backup ' + when + ".";
}

function formatClock(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function renderTimer(st) {
  const session = getTimerSession();
  const timer = getTimer(st);
  const settings = st.settings || {};

  if (session && session.open) {
    timerDisplayEl.textContent = formatHMS(session.liveSeconds);
    timerMetaEl.textContent =
      "Sessão aberta desde " +
      formatClock(timer.sessionStartedAt) +
      (settings.timerResumedAt
        ? " · retomada ao reabrir às " + formatClock(settings.timerResumedAt)
        : "") +
      ".";
    if (!tickId) {
      tickId = setInterval(function () {
        const live = getTimerSession();
        if (live && live.open) timerDisplayEl.textContent = formatHMS(live.liveSeconds);
      }, 500);
    }
  } else if (timer && timer.status === "paused") {
    timerDisplayEl.textContent = formatHMS(timer.accumulated || 0);
    timerMetaEl.textContent =
      "Pausada · iniciada às " + formatClock(timer.sessionStartedAt) + ".";
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  } else {
    timerDisplayEl.textContent = "0:00:00";
    timerMetaEl.textContent = "Nenhuma sessão em andamento.";
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  }
}

function renderStats(st) {
  const timer = getTimer(st);
  statsEl.textContent = JSON.stringify(
    {
      entries: (st.entries || []).length,
      tasks: (st.tasks || []).length,
      agenda: (st.agenda || []).length,
      timer: timer
        ? {
            status: timer.status,
            sessionStartedAt: timer.sessionStartedAt,
            liveSeconds: getTimerSession()?.liveSeconds,
          }
        : null,
      updatedAt: st.updatedAt,
    },
    null,
    2
  );
}

function render(st) {
  st = st || getState();
  statusEl.textContent = formatBackupStatus();
  const s = backupStatus();
  if (s.desktop) {
    platformEl.textContent =
      "Windows (app na bandeja): backup gravado direto na pasta escolhida.";
  } else if (s.fsAccess) {
    platformEl.textContent =
      "Navegador com acesso a pasta: backup automático na pasta escolhida.";
  } else {
    platformEl.textContent =
      "iPad / Safari: escolha a pasta quando possível, ou use Restaurar pelo app Arquivos (OneDrive/iCloud).";
  }
  renderTimer(st);
  renderStats(st);
}

document.getElementById("btn-choose").addEventListener("click", async function () {
  const result = await chooseBackupFolder();
  if (result) statusEl.textContent = 'Pasta definida: "' + result.folderName + '".';
  render();
});

document.getElementById("btn-save").addEventListener("click", async function () {
  try {
    const result = await writeBackupNow(true);
    statusEl.textContent =
      result.mode === "download"
        ? "Backup baixado (nenhuma pasta definida)."
        : "Backup salvo.";
  } catch (e) {
    statusEl.textContent = "Não foi possível gravar o backup.";
  }
  render();
});

document.getElementById("import-file").addEventListener("change", async function (ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    await importBackupFile(file);
    statusEl.textContent = "Backup importado e combinado.";
  } catch (e) {
    statusEl.textContent = "Arquivo inválido.";
  }
  ev.target.value = "";
  render();
});

document.getElementById("btn-timer-start").addEventListener("click", async function () {
  await startTimerSession({ task: "Estudo" });
  render();
});

document.getElementById("btn-timer-pause").addEventListener("click", async function () {
  await pauseTimerSession();
  render();
});

document.getElementById("btn-timer-finish").addEventListener("click", async function () {
  const result = await finishTimerSession();
  if (result) {
    timerMetaEl.textContent = "Finalizada · " + formatHMS(result.seconds) + " registrados.";
  }
  render();
});

await initStore();
subscribe(render);
render();

document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    flushAutoBackup();
  } else {
    render();
  }
});
window.addEventListener("pagehide", flushAutoBackup);
