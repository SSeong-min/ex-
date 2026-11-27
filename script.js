/* 동작 코드 - 평소엔 건드릴 필요 없어요. 앨범/곡 내용은 data.js에서 수정하세요. */
const $ = s => document.querySelector(s);
const grad = c => `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
// 사진이 없거나 경로가 틀려도 색 그라데이션이 대신 보이도록 겹쳐서 지정
const bgOf = a => (a.cover ? `url('${a.cover}'), ` : "") + grad(a.colors);
const trackBg = (t, a) => t.img ? `url('${t.img}'), ${bgOf(a)}` : bgOf(a);
const ytId = u => { const m = (u||"").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; };

/* --- 목록 + 장르 필터 --- */
let genre = "전체";
function renderFilters(){
  const genres = ["전체", ...new Set(albums.map(a => a.genre))];
  $("#filters").innerHTML = genres.map(g =>
    `<button class="${g===genre?'on':''}" data-g="${g}">${g}</button>`).join("");
  $("#filters").querySelectorAll("button").forEach(b => b.onclick = () => { genre = b.dataset.g; renderFilters(); renderGrid(); });
}
function renderGrid(){
  $("#grid").innerHTML = albums.filter(a => genre==="전체" || a.genre===genre).map(a => `
    <a class="card" href="#${a.id}">
      <div class="cover" style="background-image:${bgOf(a)}"></div>
      <h3>${a.title}</h3><p>${a.artist}</p>
    </a>`).join("");
}

/* --- 앨범 상세 --- */
let cur = null, list = [], idx = 0;
function setAlbumMode(m){
  srcMode = m;
  document.querySelectorAll("#albumSwitch button").forEach(b => b.classList.toggle("on", b.dataset.s === m));
  $("#trackList").classList.toggle("sp", m === "spotify");   // 스포티파이 모드면 곡 목록 표시도 바뀜
}
document.querySelectorAll("#albumSwitch button").forEach(b => b.onclick = () => setAlbumMode(b.dataset.s));

function renderDetail(a){
  cur = a;
  $("#heroBg").style.backgroundImage = bgOf(a);
  $("#heroCover").style.backgroundImage = bgOf(a);
  $("#dTitle").textContent = a.title;
  $("#dMeta").textContent = `${a.artist} · ${a.year} · ${a.genre}`;
  $("#dDesc").textContent = a.desc;
  list = [...a.tracks].sort((x,y) => (y.main?1:0) - (x.main?1:0)); // 대표곡 먼저
  $("#trackList").innerHTML = list.map((t,i) => `
    <li data-i="${i}" tabindex="0" role="button" class="${ytId(t.url)?'':'nolink'} ${spOf(t)?'':'nosp'}">
      <span class="play">▶</span><span class="name">${t.t}</span>
      ${t.main?'<span class="badge">대표곡</span>':''}<span class="len">${t.l||""}</span></li>`).join("");
  $("#trackList").querySelectorAll("li").forEach(li => {
    li.onclick = () => openPlayer(+li.dataset.i);
    li.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openPlayer(+li.dataset.i); } };
  });
  setAlbumMode("youtube");                                      // 앨범에 들어오면 기본은 YouTube
  document.title = `${a.title} - ${site.title}`;
}

/* --- 재생 화면 (YouTube 기본 / Spotify 전환) --- */
let hintTimer = null, yt = null, apiReady = false, pendingId = null, dragging = false, timer = null;
let srcMode = "youtube";     // 앨범 전체 기본 재생 방식
let trackMode = "youtube";   // 지금 재생 중인 곡의 재생 방식 (곡마다 따로 전환 가능)
let sp = null, spApi = null, pendingSp = null, spPos = 0, spDur = 0, spPaused = true, spStamp = 0, spCtx = "track", spEnded = false;
const fmt = s => { s = Math.max(0, Math.floor(s||0)); return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0"); };

// 스포티파이 링크(https://open.spotify.com/track/ID 또는 spotify:track:ID) -> spotify:track:ID
const spUri = u => {
  u = (u||"").trim();
  if(/^spotify:(track|album|playlist):[A-Za-z0-9]+$/.test(u)) return u;
  const m = u.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
};
// 곡에 스포티파이 곡 링크가 있으면 그것, 없으면 앨범 링크로 대신 재생
const spOf = t => {
  const tu = spUri(t.sp);
  if(tu) return { uri: tu, ctx: tu.includes(":track:") ? "track" : "album" };
  const au = spUri(cur && cur.spotify);
  return au ? { uri: au, ctx: "album" } : null;
};

window.onYouTubeIframeAPIReady = () => { apiReady = true; if(pendingId) loadVideo(pendingId); };
window.onSpotifyIframeApiReady = api => { spApi = api; if(pendingSp) loadSpotify(pendingSp); };

/* 공통: 재생 위치 / 길이 / 이동 (현재 방식에 맞게) */
function curTime(){
  if(trackMode === "spotify") return spPaused ? spPos : spPos + (performance.now() - spStamp) / 1000;
  return yt && yt.getCurrentTime ? (yt.getCurrentTime() || 0) : 0;
}
function durTime(){
  if(trackMode === "spotify") return spDur;
  return yt && yt.getDuration ? (yt.getDuration() || 0) : 0;
}
function seekTo(sec){
  if(trackMode === "spotify"){ if(sp){ sp.seek(sec); spPos = sec; spStamp = performance.now(); } }
  else if(yt && yt.seekTo) yt.seekTo(sec, true);
}
function setPlaying(p, keepTick){
  $("#player").classList.toggle("playing", p);          // 재생 중일 때만 원반이 돌아감
  $("#pToggle").textContent = p ? "❚❚" : "▶";
  if(p) startTick(); else if(!keepTick) stopTick();
}

/* YouTube */
function loadVideo(id){
  if(!apiReady){ pendingId = id; return; }
  pendingId = null;
  if(yt){ yt.loadVideoById(id); return; }
  yt = new YT.Player("pYT", {
    width:"200", height:"200", videoId:id,
    playerVars:{ autoplay:1, playsinline:1, rel:0 },
    events:{
      onReady: e => { if(trackMode === "youtube") e.target.playVideo(); },
      onStateChange: e => {
        if(trackMode !== "youtube") return;               // 스포티파이로 전환한 뒤에는 무시
        const playing = e.data === 1;
        if(playing) showMsg("");
        setPlaying(playing, e.data === 3);
        if(e.data === 0 && list.length > 1) openPlayer(idx + 1);   // 끝나면 다음 곡
      },
      onError: e => {
        if(trackMode !== "youtube") return;
        const c = e.data;
        if(c === 153 || c === 152) showMsg("파일로 직접 연 화면에서는 재생이 안 돼요. Live Server나 GitHub 주소로 열어 주세요.");
        else if(c === 101 || c === 150) showMsg("이 영상은 올린 사람이 외부 재생을 막아뒀어요. 다른 영상 링크로 바꾸거나 Spotify로 전환해 보세요.");
        else if(c === 2 || c === 100) showMsg("영상 링크를 찾을 수 없어요. 주소가 맞는지 확인해 주세요.");
        else showMsg("이 영상을 재생할 수 없어요. (오류 " + c + ")");
      }
    }
  });
}

/* Spotify */
function loadSpotify(uri){
  if(!spApi){ pendingSp = uri; return; }
  pendingSp = null;
  if(sp){ sp.loadUri(uri); setTimeout(() => { if(trackMode === "spotify") sp.play(); }, 500); return; }
  spApi.createController($("#pSP"), { uri, width:"100%", height:80 }, c => {
    sp = c;
    c.addListener("ready", () => { if(trackMode === "spotify") c.play(); });
    c.addListener("playback_update", onSpUpdate);
  });
}
function onSpUpdate(e){
  if(trackMode !== "spotify" || !e || !e.data) return;
  const d = e.data;
  spPos = d.position / 1000; spDur = d.duration / 1000; spPaused = d.isPaused; spStamp = performance.now();
  if(!d.isPaused && spCtx === "track") showMsg("");
  setPlaying(!d.isPaused);
  tick();
  // 곡 하나가 끝나면 다음 곡 (앨범 전체 링크로 재생 중일 땐 스포티파이가 알아서 넘김)
  if(spCtx === "track" && d.isPaused && d.duration > 0 && d.position >= d.duration - 300 && !spEnded && list.length > 1){
    spEnded = true; openPlayer(idx + 1);
  }
}

function showMsg(m){ $("#pMsg").textContent = m; $("#pMsg").hidden = !m; }
function startTick(){ stopTick(); timer = setInterval(tick, 120); tick(); }
function stopTick(){ clearInterval(timer); }
function tick(){
  if(dragging) return;
  const d = durTime(), c = d ? Math.min(curTime(), d) : curTime();
  $("#pCur").textContent = fmt(c); $("#pDur").textContent = fmt(d);
  setBar(d ? c/d*1000 : 0);
  updateLyrics(c);
}
function setBar(v){ $("#pBar").value = v; $("#pBar").style.setProperty("--p", (v/10) + "%"); }

function stopYT(){ if(yt && yt.stopVideo){ try{ yt.stopVideo(); }catch(e){} } }
function stopSP(){ if(sp){ try{ sp.pause(); }catch(e){} } }

/* 현재 곡을 trackMode(youtube / spotify)에 맞게 재생 시작 */
function startSource(){
  const t = list[idx], pl = $("#player");
  clearTimeout(hintTimer);
  stopTick();
  pl.classList.remove("playing");
  pl.classList.toggle("sp-on", trackMode === "spotify");
  document.querySelectorAll("#trackSwitch button").forEach(b => b.classList.toggle("on", b.dataset.s === trackMode));
  $("#pToggle").textContent = "▶";
  spEnded = false; spPos = 0; spDur = 0; spPaused = true;
  showMsg("");
  const hint = text => { hintTimer = setTimeout(() => {
    if(pl.classList.contains("open") && !pl.classList.contains("playing") && !$("#pMsg").textContent) showMsg(text);
  }, 3500); };

  if(trackMode === "spotify"){
    stopYT();
    const s = spOf(t);
    if(!s){ stopSP(); showMsg("이 곡은 아직 Spotify 링크가 없어요. data.js에 sp(곡) 또는 spotify(앨범)를 추가해 주세요."); return; }
    spCtx = s.ctx;
    if(s.ctx === "album") showMsg("이 곡의 Spotify 링크가 없어서 앨범이 처음부터 재생돼요.");
    loadSpotify(s.uri);
    hint("재생이 시작되지 않았어요. 아래 Spotify 플레이어에서 ▶를 누르거나 로그인해 주세요. (로그인 안 하면 30초 미리듣기)");
  } else {
    stopSP();
    const id = ytId(t.url);
    if(id){ loadVideo(id); hint("재생이 시작되지 않았어요. ▶ 버튼을 눌러 주세요."); }
    else { showMsg("이 곡은 아직 유튜브 링크가 없어요. data.js에서 url을 추가하거나 Spotify로 전환해 보세요."); stopYT(); }
  }
}

function openPlayer(i){
  idx = (i + list.length) % list.length;
  const t = list[idx];
  trackMode = srcMode;                                   // 앨범 기본 방식으로 시작 (곡 화면에서 따로 전환 가능)
  $("#pBg").style.backgroundImage = trackBg(t, cur);     // 뒷배경: 흐릿하게
  $("#pCover").style.backgroundImage = trackBg(t, cur);  // 가운데: 선명하게
  $("#pTitle").textContent = t.t;
  $("#pArtist").textContent = cur.artist;
  setBar(0); $("#pCur").textContent = "0:00"; $("#pDur").textContent = t.l || "0:00";
  try{                                                   // 원반/가사에 문제가 생겨도 음악 재생은 계속되게
    $("#pDiscLabel").style.backgroundImage = trackBg(t, cur);   // 원반 가운데 라벨
    setLyrics(t);
  }catch(err){ console.error(err); }
  $("#player").classList.add("open");
  document.body.classList.add("lock");
  startSource();
}
function closePlayer(){
  $("#player").classList.remove("open", "playing", "sp-on");
  document.body.classList.remove("lock");
  clearTimeout(hintTimer);
  stopTick();
  stopYT(); stopSP();
}
/* 곡 화면의 전환 버튼: 이 곡만 YouTube <-> Spotify */
document.querySelectorAll("#trackSwitch button").forEach(b => b.onclick = () => {
  if(b.dataset.s === trackMode) return;
  trackMode = b.dataset.s;
  startSource();
});
$("#pClose").onclick = closePlayer;
$("#pLogo").onclick = closePlayer;
$("#pPrev").onclick = () => openPlayer(idx - 1);
$("#pNext").onclick = () => openPlayer(idx + 1);
$("#pToggle").onclick = () => {
  if(trackMode === "spotify"){ if(sp) sp.togglePlay(); return; }
  if(!yt || !yt.getPlayerState) return;
  yt.getPlayerState() === 1 ? yt.pauseVideo() : yt.playVideo();
};
$("#pBar").addEventListener("input", e => { dragging = true; setBar(+e.target.value);
  const d = durTime(); if(d){ const tt = d * e.target.value / 1000; $("#pCur").textContent = fmt(tt); updateLyrics(tt); } });
$("#pBar").addEventListener("change", e => { dragging = false;
  const d = durTime(); if(d){ const tt = d * e.target.value / 1000; seekTo(tt); updateLyrics(tt); } });
document.addEventListener("keydown", e => { if(e.key==="Escape") closePlayer(); });


/* --- 가사 (싱크) --- */
let curLines = [], lyIdx = -2, lyOff = 0;
const esc = x => x.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

// "[00:12.50] 가사" 형식(LRC)을 [{t:시간(초), text}] 로 바꿈. 시간이 하나도 없으면 그냥 텍스트로 보여줌
function parseLRC(src){
  const timed = [], plain = [];
  src.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if(!line || /^\[(ar|ti|al|by|offset|length|re|ve):/i.test(line)) return;
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    const text = line.replace(/\[[^\]]*\]/g, "").trim();
    if(stamps.length) stamps.forEach(m => timed.push({ t: +m[1]*60 + parseFloat(m[2].replace(":", ".")), text }));
    else plain.push({ t: null, text: line });
  });
  return timed.length ? timed.sort((a,b) => a.t - b.t) : plain;
}
function setLyrics(t){
  curLines = parseLRC(t.lyrics || "");
  lyOff = t.lyricOffset || 0;
  lyIdx = -2;
  const box = $("#pLyrics"), el = $("#pLines");
  el.style.transform = "";
  if(!curLines.length){
    box.classList.add("plain");
    el.innerHTML = `<p class="ly-empty">가사가 없어요</p>`;
    return;
  }
  box.classList.toggle("plain", curLines[0].t === null);
  el.innerHTML = curLines.map((l,i) => `<p class="ly" data-i="${i}">${esc(l.text) || "♪"}</p>`).join("");
  el.querySelectorAll(".ly").forEach(p => p.onclick = () => {      // 가사를 누르면 그 부분으로 이동
    const l = curLines[+p.dataset.i];
    if(l.t !== null){ seekTo(Math.max(0, l.t - lyOff)); updateLyrics(l.t - lyOff); }
  });
  placeLyrics(0);
}
function placeLyrics(i){
  const box = $("#pLyrics"), el = $("#pLines"), line = el.children[Math.max(i, 0)];
  if(!line || box.classList.contains("plain")) return;
  el.style.transform = `translateY(${box.clientHeight/2 - (line.offsetTop + line.offsetHeight/2)}px)`;
}
function updateLyrics(time){
  if(!curLines.length || curLines[0].t === null) return;
  const t = time + lyOff;
  let idx = -1;
  for(let i = 0; i < curLines.length; i++){ if(curLines[i].t <= t) idx = i; else break; }
  if(idx === lyIdx) return;
  lyIdx = idx;
  const kids = $("#pLines").children;
  for(let i = 0; i < kids.length; i++) kids[i].classList.toggle("active", i === idx);
  placeLyrics(idx);                                    // 한 줄 끝날 때마다 한 줄씩 위로
}
window.addEventListener("resize", () => placeLyrics(lyIdx));

/* --- 주소(#앨범id)에 따라 화면 전환 --- */
let wasDetail = false, routeTimer = null;
const jump = y => window.scrollTo({ top: y, behavior: "instant" });
function route(){
  closePlayer();
  clearTimeout(routeTimer);
  const a = albums.find(x => x.id === location.hash.slice(1));
  const detail = $("#detail"), home = $("#home");

  if(a){                                   // 앨범 들어가기: 아래에서 위로 올라오며 나타남
    home.hidden = true; detail.hidden = false; $("#filters").hidden = true;
    detail.classList.remove("leaving", "enter");
    renderDetail(a);
    jump(0);
    void detail.offsetWidth;               // 애니메이션 다시 시작
    detail.classList.add("enter");
    wasDetail = true;
  } else if(wasDetail){                    // 앨범에서 나가기: 반대로 내려가며 사라진 뒤 목록 표시
    document.title = site.title;
    detail.classList.remove("enter");
    detail.classList.add("leaving");
    routeTimer = setTimeout(() => {
      detail.hidden = true; detail.classList.remove("leaving");
      home.hidden = false; $("#filters").hidden = false;
      home.classList.remove("fadein"); void home.offsetWidth; home.classList.add("fadein");
      jump($("#grid").getBoundingClientRect().top + window.scrollY - 70);   // 앨범 목록 위치로
      wasDetail = false;
      onScroll();
    }, 350);
  } else {                                 // 처음 접속
    home.hidden = false; detail.hidden = true; $("#filters").hidden = false;
    document.title = site.title;
    jump(0);
  }
}
window.addEventListener("hashchange", route);

/* --- 첫 화면: 제목/설명/배경 + 스크롤하면 배경이 검정으로 --- */
function applyFont(name, cssVar){
  if(!name) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(name).replace(/%20/g, "+") + "&display=swap";
  document.head.appendChild(link);
  document.documentElement.style.setProperty(cssVar,
    `"${name}", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`);
}
function setupSite(){
  applyFont(site.fontTitle, "--font-title");
  applyFont(site.fontBody, "--font-body");
  document.querySelector(".logo").textContent = site.title;
  $("#pLogo").textContent = site.title;      // 재생 화면 왼쪽 위 로고: 누르면 그 앨범 화면으로
  $("#siteTitle").textContent = site.title;
  $("#siteDesc").textContent = site.desc;
  $("#homeBg").style.backgroundImage = (site.bg ? `url('${site.bg}'), ` : "") + grad(site.bgColors);
}
function onScroll(){
  const y = window.scrollY, h = window.innerHeight;
  // 스크롤 가능한 길이 안에서 배경이 완전히 검정이 되도록 계산
  const maxScroll = document.documentElement.scrollHeight - h;
  const fadeDist = Math.max(1, Math.min(h * 0.8, maxScroll * 0.8));
  $("#homeBg").style.opacity = Math.max(0, 1 - y / fadeDist);
  $("#introText").style.opacity = Math.max(0, 1 - y / (h * 0.5));
  document.querySelector(".top").classList.toggle("solid", y > h * 0.5);
}
window.addEventListener("scroll", onScroll, {passive:true});
window.addEventListener("resize", onScroll);

function renderTeam(){
  $("#teamGrid").innerHTML = team.map(m => `
    <article class="member">
      <div class="avatar" style="${m.img ? `background-image:url('${m.img}')` : ''}">${m.img ? '' : m.name.charAt(0)}</div>
      <h3>${m.name}</h3>
      <p>${m.role}</p>
    </article>`).join("");
}

setupSite(); renderTeam(); renderFilters(); renderGrid(); route(); onScroll();
