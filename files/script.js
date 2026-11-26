/* 동작 코드 - 평소엔 건드릴 필요 없어요. 앨범/곡 내용은 data.js에서 수정하세요. */
const $ = s => document.querySelector(s);
const bgOf = a => a.cover ? `url("${a.cover}")` : `linear-gradient(135deg, ${a.colors[0]}, ${a.colors[1]})`;
const trackBg = (t, a) => t.img ? `url("${t.img}")` : bgOf(a);
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
function renderDetail(a){
  cur = a;
  $("#heroBg").style.backgroundImage = bgOf(a);
  $("#heroCover").style.backgroundImage = bgOf(a);
  $("#dTitle").textContent = a.title;
  $("#dMeta").textContent = `${a.artist} · ${a.year} · ${a.genre}`;
  $("#dDesc").textContent = a.desc;
  list = [...a.tracks].sort((x,y) => (y.main?1:0) - (x.main?1:0)); // 대표곡 먼저
  $("#trackList").innerHTML = list.map((t,i) => `
    <li data-i="${i}" tabindex="0" role="button" class="${ytId(t.url)?'':'nolink'}">
      <span class="play">▶</span><span class="name">${t.t}</span>
      ${t.main?'<span class="badge">대표곡</span>':''}<span class="len">${t.l||""}</span></li>`).join("");
  $("#trackList").querySelectorAll("li").forEach(li => {
    li.onclick = () => openPlayer(+li.dataset.i);
    li.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openPlayer(+li.dataset.i); } };
  });
  document.title = `${a.title} - ${site.title}`;
}

/* --- 재생 화면 (유튜브 영상은 숨기고 소리 + 진행바만 사용) --- */
let yt = null, apiReady = false, pendingId = null, dragging = false, timer = null;
const fmt = s => { s = Math.max(0, Math.floor(s||0)); return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0"); };

window.onYouTubeIframeAPIReady = () => { apiReady = true; if(pendingId) loadVideo(pendingId); };

function loadVideo(id){
  if(!apiReady){ pendingId = id; return; }
  pendingId = null;
  if(yt){ yt.loadVideoById(id); return; }
  yt = new YT.Player("pYT", {
    width:"200", height:"200", videoId:id,
    playerVars:{ autoplay:1, playsinline:1, rel:0 },
    events:{
      onReady: e => e.target.playVideo(),
      onStateChange: e => {
        const playing = e.data === 1;
        $("#pToggle").textContent = playing ? "❚❚" : "▶";
        if(playing) startTick(); else if(e.data !== 3) stopTick();
        if(e.data === 0 && list.length > 1) openPlayer(idx + 1);   // 끝나면 다음 곡
      },
      onError: () => showMsg("이 영상은 사이트 안에서 재생할 수 없어요. 다른 영상 링크로 바꿔 주세요.")
    }
  });
}
function showMsg(m){ $("#pMsg").textContent = m; $("#pMsg").hidden = !m; }
function startTick(){ stopTick(); timer = setInterval(tick, 250); tick(); }
function stopTick(){ clearInterval(timer); }
function tick(){
  if(!yt || !yt.getDuration || dragging) return;
  const d = yt.getDuration() || 0, c = yt.getCurrentTime() || 0;
  $("#pCur").textContent = fmt(c); $("#pDur").textContent = fmt(d);
  setBar(d ? c/d*1000 : 0);
}
function setBar(v){ $("#pBar").value = v; $("#pBar").style.setProperty("--p", (v/10) + "%"); }

function openPlayer(i){
  idx = (i + list.length) % list.length;
  const t = list[idx], id = ytId(t.url);
  $("#pBg").style.backgroundImage = trackBg(t, cur);     // 뒷배경: 흐릿하게
  $("#pCover").style.backgroundImage = trackBg(t, cur);  // 가운데: 선명하게
  $("#pTitle").textContent = t.t;
  $("#pArtist").textContent = cur.artist;
  setBar(0); $("#pCur").textContent = "0:00"; $("#pDur").textContent = t.l || "0:00";
  $("#pToggle").textContent = "▶";
  $("#player").hidden = false;
  document.body.classList.add("lock");
  if(id){ showMsg(""); loadVideo(id); }
  else { showMsg("이 곡은 아직 유튜브 링크가 없어요. data.js에서 url을 추가해 주세요."); if(yt) yt.stopVideo(); }
}
function closePlayer(){
  $("#player").hidden = true;
  document.body.classList.remove("lock");
  stopTick();
  if(yt && yt.stopVideo) yt.stopVideo();
}
$("#pClose").onclick = closePlayer;
$("#pPrev").onclick = () => openPlayer(idx - 1);
$("#pNext").onclick = () => openPlayer(idx + 1);
$("#pToggle").onclick = () => {
  if(!yt || !yt.getPlayerState) return;
  yt.getPlayerState() === 1 ? yt.pauseVideo() : yt.playVideo();
};
$("#pBar").addEventListener("input", e => { dragging = true; setBar(+e.target.value);
  if(yt && yt.getDuration) $("#pCur").textContent = fmt(yt.getDuration() * e.target.value / 1000); });
$("#pBar").addEventListener("change", e => { dragging = false;
  if(yt && yt.seekTo) yt.seekTo(yt.getDuration() * e.target.value / 1000, true); });
document.addEventListener("keydown", e => { if(e.key==="Escape") closePlayer(); });

/* --- 주소(#앨범id)에 따라 화면 전환 --- */
let wasDetail = false;
function route(){
  closePlayer();
  const a = albums.find(x => x.id === location.hash.slice(1));
  $("#home").hidden = !!a; $("#detail").hidden = !a;
  $("#filters").hidden = !!a;
  if(a) renderDetail(a); else document.title = site.title;
  if(!a && wasDetail){
    // 앨범 화면에서 돌아오면 첫 화면이 아니라 앨범 목록 위치로
    window.scrollTo({ top: $("#grid").getBoundingClientRect().top + window.scrollY - 70, behavior: "instant" });
  } else {
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  wasDetail = !!a;
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
  $("#siteTitle").textContent = site.title;
  $("#siteDesc").textContent = site.desc;
  $("#homeBg").style.backgroundImage = site.bg
    ? `url("${site.bg}")` : `linear-gradient(135deg, ${site.bgColors[0]}, ${site.bgColors[1]})`;
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
