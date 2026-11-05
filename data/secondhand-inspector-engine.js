(function(){
  "use strict";

  // Shared Secondhand Motion Multi-Lens & Parts Inspector Engine for ICARO-PRO
  let cvWorm = null, ctxWorm = null;
  let cvStage = null, ctxStage = null;
  let planesRow = null, parallelSubSeg = null, parThemeBtn = null;
  let restorePlanesBtn = null, zoomCrumbBtn = null;
  let kScaleRange = null, kScaleLbl = null, explodeRange = null, explodeLbl = null;

  let WORMS = [];
  let curIdx = 0;
  let curWorm = null;
  let curVariant = 'gwp';
  let S = null;
  let shotCache = new Map();
  let frameImgCache = new Map();

  let wormMode = 'lanes';      // 'all' | 'parallel' | 'lanes' | 'parts' | 'strobe' | 'kymo' | 'anatomy' | 'box' | 'wall'
  let parallelSubMode = 'butter'; // 'butter' | 'slices' | 'radial' | 'dual'
  let parallelDark = true;
  let view = 'composite';      // 'dots' | 'all4' | 'composite' | 'xray' | 'cutout' | 'cartoon' | 'footage' | 'masks'
  let stageInDotsMode = false; // Default top stage to high-res 'composite' or 'dots' (user can switch 1-click!)
  let f = 0;
  let soloPlaneId = null;
  let planeOn = {};
  let zoomPlaneId = null;
  let selectedPartId = null;
  let hoveredPartId = null;
  let kScale = 1.0;
  let explodeAmt = 0.0;
  let wormHitBoxes = [];
  let stageHitBoxes = [];
  let hitTransform = {tx: 0, ty: 0, sx: 1, sy: 1};

  function pushHitBox(b){
    wormHitBoxes.push(Object.assign({}, b, {
      x: hitTransform.tx + b.x * hitTransform.sx,
      y: hitTransform.ty + b.y * hitTransform.sy,
      w: b.w * hitTransform.sx,
      h: b.h * hitTransform.sy
    }));
  }
  const PART_PALETTE = [
    '#EF9F3A', '#2E7A4A', '#2B6CB0', '#B8432F', '#7B4EC4',
    '#0E8A8A', '#C86D24', '#3A6E9E', '#8A6114', '#A63A69'
  ];

  const PLANE_TINTS = {
    far:   {fill:'rgba(92, 128, 188, 0.22)', stroke:'#3A5F9CD0'},
    mid:   {fill:'rgba(58, 125, 68, 0.24)',  stroke:'#2E6B3AD0'},
    near:  {fill:'rgba(196, 148, 52, 0.28)', stroke:'#8A6114D0'},
    char:  {fill:'rgba(239, 159, 58, 0.34)', stroke:'#8A4A05'}
  };
  function tintForPlane(pid, z, zRef){
    if(pid === 'char') return PLANE_TINTS.char;
    if(PLANE_TINTS[pid]) return PLANE_TINTS[pid];
    if(z < (zRef || 2)) return PLANE_TINTS.near;
    if(z <= (zRef || 2) * 2.2) return PLANE_TINTS.mid;
    return PLANE_TINTS.far;
  }

  function jitter(pt, seed, amp){
    const x = pt[0], y = pt[1];
    const h1 = Math.sin(x*12.9898 + y*78.233 + seed*43.1) * 43758.5453;
    const h2 = Math.cos(x*93.9898 + y*12.233 + seed*19.7) * 28413.1234;
    return [x + (h1 - Math.floor(h1) - 0.5)*2*amp, y + (h2 - Math.floor(h2) - 0.5)*2*amp];
  }

  function drawStrokes(ctx, strokes, opts){
    const o = Object.assign({color:'#161412', width:2.4, dx:0, dy:0, boilSeed:0, boilAmp:0, fill:null}, opts||{});
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.color;
    ctx.lineWidth = o.width;
    if(o.fill && strokes && strokes.length){
      ctx.fillStyle = o.fill;
      for(const s of strokes){
        if(!s || s.length < 4) continue;
        ctx.beginPath();
        for(let i=0;i<s.length;i++){
          let x = s[i][0] + o.dx, y = s[i][1] + o.dy;
          if(o.boilAmp>0){ const j = jitter([x,y], o.boilSeed+i*0.07, o.boilAmp); x=j[0]; y=j[1]; }
          if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    for(const s of (strokes||[])){
      if(!s || s.length < 2) continue;
      ctx.beginPath();
      for(let i=0;i<s.length;i++){
        let x = s[i][0] + o.dx, y = s[i][1] + o.dy;
        if(o.boilAmp>0){ const j = jitter([x,y], o.boilSeed+i*0.1, o.boilAmp); x=j[0]; y=j[1]; }
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function getFrameImg(worm, fi){
    if(!worm) return null;
    if(S && S._imgs && S._imgs[fi] && S._imgs[fi].complete && S._imgs[fi].naturalWidth > 0){
      return S._imgs[fi];
    }
    const key = worm.shot_id + ':' + fi;
    if(frameImgCache.has(key)){
      const im = frameImgCache.get(key);
      return (im.complete && im.naturalWidth > 0) ? im : null;
    }
    const im = new Image();
    im.crossOrigin = 'anonymous';
    const pad = String(fi).padStart(3, '0');
    im.src = `https://hartswf0.github.io/secondhand-motion/shots/${worm.shot_id}/frames/f${pad}.jpg`;
    im.onload = () => { if(curWorm === worm) renderAll(); };
    frameImgCache.set(key, im);
    return null;
  }

  function getActivePlanes(){
    if(S && Array.isArray(S.planes) && S.planes.length){
      return S.planes.slice().sort((a,b)=>b.z - a.z);
    }
    if(curWorm && Array.isArray(curWorm.planes) && curWorm.planes.length){
      return curWorm.planes.slice().sort((a,b)=>b.z - a.z);
    }
    return [{id:'char', z:2, label:'Subject'}];
  }

  function isPlaneVisible(pid){
    if(soloPlaneId) return pid === soloPlaneId;
    if(pid in planeOn) return planeOn[pid] !== false;
    return true;
  }

  function camOffset(planeZ, fi){
    const zRef = (S && S.z_ref) || (curWorm && curWorm.z_ref) || 2;
    const k = (zRef / Math.max(0.2, Number(planeZ) || zRef)) * kScale;
    let dx = 0, dy = 0;
    if(S && Array.isArray(S.camera) && S.camera[fi] != null){
      const cam = S.camera[fi];
      const cx = Array.isArray(cam) ? Number(cam[0]) : Number(cam.dx !== undefined ? cam.dx : cam.x);
      const cy = Array.isArray(cam) ? Number(cam[1]) : Number(cam.dy !== undefined ? cam.dy : cam.y);
      dx = (Number.isFinite(cx) ? cx : 0) * k;
      dy = (Number.isFinite(cy) ? cy : 0) * k;
    } else if(curWorm && curWorm.frames && curWorm.frames[fi]){
      const cam = curWorm.frames[fi].cam || [0,0];
      const W = (S && S.W) || curWorm.W || 480;
      const H = (S && S.H) || curWorm.H || 360;
      const cx = Number(cam[0]) || 0;
      const cy = Number(cam[1]) || 0;
      dx = cx * W * k;
      dy = cy * H * k;
    }
    if(explodeAmt > 0){
      const logZ = Math.log2(Math.max(0.4, Number(planeZ) || zRef) / Math.max(0.4, zRef));
      dy -= logZ * explodeAmt * 38;
    }
    return {dx, dy};
  }

  function computeStrokesBBox(strokes, W, H){
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, nPts = 0;
    for(const s of (strokes || [])){
      for(const p of (s || [])){
        if(!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        nPts++;
        if(p[0] < minX) minX = p[0]; if(p[1] < minY) minY = p[1];
        if(p[0] > maxX) maxX = p[0]; if(p[1] > maxY) maxY = p[1];
      }
    }
    if(!Number.isFinite(minX) || minX >= maxX){
      minX = W * 0.25; maxX = W * 0.75; minY = H * 0.25; maxY = H * 0.75;
    }
    return {
      minX, minY, maxX, maxY,
      cx: (minX + maxX) * 0.5,
      cy: (minY + maxY) * 0.5,
      w: Math.max(8, maxX - minX),
      h: Math.max(8, maxY - minY),
      nPts
    };
  }

  function extractShotParts(fi, filterPlaneId){
    if(!curWorm) return [];
    const W = (S && S.W) || curWorm.W || 480;
    const H = (S && S.H) || curWorm.H || 360;
    const N = (S && S.cast && S.cast.frames) ? S.cast.frames.length : (curWorm.n_frames || 1);
    const zRef = (S && S.z_ref) || curWorm.z_ref || 2;
    const planes = getActivePlanes();
    const parts = [];
    let colorIdx = 0;

    function getCharStrokesAt(ti){
      if(S && S.cast && S.cast.frames && S.cast.frames[ti]){
        return S.cast.frames[ti];
      }
      if(curWorm.frames && curWorm.frames[ti] && curWorm.frames[ti].doodle){
        return curWorm.frames[ti].doodle.map(s => s.map(p => [p[0]*W, p[1]*H]));
      }
      return [];
    }

    const charPlane = planes.find(p => p.id === 'char') || {id:'char', z:2, label:curWorm.title || 'Subject'};
    const charStrokesFi = getCharStrokesAt(fi);
    const charStrokes0  = getCharStrokesAt(0);

    // 1. Character whole rig + individual anatomical strokes when zoomed into char (or top stroke groups at overview)
    if(!filterPlaneId || filterPlaneId === 'char'){
      const bbFi = computeStrokesBBox(charStrokesFi, W, H);
      const bb0  = computeStrokesBBox(charStrokes0, W, H);
      const tr = [];
      for(let ti = 0; ti < N; ti += Math.max(1, Math.floor(N / 16))){
        const bTi = computeStrokesBBox(getCharStrokesAt(ti), W, H);
        tr.push({ti, cx: bTi.cx, cy: bTi.cy, camDx: 0, rigDx: bTi.cx - bb0.cx});
      }
      if(!filterPlaneId){
        parts.push({
          id: 'char:all',
          label: `${charPlane.label} (Full Rig)`,
          shortLabel: String(charPlane.label || 'Subject').slice(0, 14),
          planeId: 'char',
          planeLabel: charPlane.label,
          z: charPlane.z,
          k: 1.0,
          isChar: true,
          strokes: charStrokesFi,
          strokes0: charStrokes0,
          bbox: bbFi,
          camShift: {dx: 0, dy: 0},
          rigShift: {dx: bbFi.cx - bb0.cx, dy: bbFi.cy - bb0.cy},
          nStrokes: charStrokesFi.length,
          nPts: bbFi.nPts,
          sourceTag: 'RIG',
          sourceFull: 'SAM 2.1 silhouette + agent keyframe rig',
          color: '#EF9F3A',
          track: tr
        });
      }
      // Individual strokes of character
      const maxCharSub = filterPlaneId === 'char' ? charStrokesFi.length : Math.min(3, charStrokesFi.length);
      for(let sIdx = 0; sIdx < maxCharSub; sIdx++){
        const stFi = charStrokesFi[sIdx] ? [charStrokesFi[sIdx]] : [];
        const st0  = charStrokes0[sIdx] ? [charStrokes0[sIdx]] : stFi;
        if(!stFi.length) continue;
        const bS = computeStrokesBBox(stFi, W, H);
        const bS0 = computeStrokesBBox(st0, W, H);
        const relY = (bS.cy - bbFi.minY) / Math.max(12, bbFi.h);
        const anatRole = relY < 0.33 ? 'Crown/Head' : (relY < 0.68 ? 'Body/Core' : 'Limbs/Base');
        const sTrack = [];
        for(let ti = 0; ti < N; ti += Math.max(1, Math.floor(N / 14))){
          const cSt = getCharStrokesAt(ti);
          const bT = computeStrokesBBox(cSt[sIdx] ? [cSt[sIdx]] : [], W, H);
          sTrack.push({ti, cx: bT.cx, cy: bT.cy, camDx: 0, rigDx: bT.cx - bS0.cx});
        }
        parts.push({
          id: `char:s${sIdx}`,
          label: `Stroke #${sIdx+1} (${anatRole})`,
          shortLabel: `S${sIdx+1} ${anatRole}`,
          planeId: 'char',
          planeLabel: charPlane.label,
          z: charPlane.z,
          k: 1.0,
          isChar: false,
          isCharStroke: true,
          strokes: stFi,
          strokes0: st0,
          bbox: bS,
          camShift: {dx: 0, dy: 0},
          rigShift: {dx: bS.cx - bS0.cx, dy: bS.cy - bS0.cy},
          nStrokes: 1,
          nPts: bS.nPts,
          sourceTag: 'RIG',
          sourceFull: `${charPlane.label} rig stroke #${sIdx+1} (${bS.nPts} vertices)`,
          color: PART_PALETTE[( ++colorIdx ) % PART_PALETTE.length],
          track: sTrack
        });
      }
    }

    // 2. Non-character plane objects (from S.objects or fallback curWorm.depth_worms)
    const nonCharPlanes = planes.filter(p => p.id !== 'char' && (!filterPlaneId || p.id === filterPlaneId));
    for(const plane of nonCharPlanes){
      if(!isPlaneVisible(plane.id) && !filterPlaneId) continue;
      const offFi = camOffset(plane.z, fi);
      const off0  = camOffset(plane.z, 0);
      const kMult = (zRef / Math.max(0.2, plane.z)) * kScale;
      const objs = (S && Array.isArray(S.objects)) ? S.objects.filter(o => o.plane === plane.id) : [];

      if(objs.length > 0){
        // At overview level, if a plane has > 4 objects (e.g. 20 grass or 12 bushes), group into 3 spatial clusters (L/M/R)
        // When zoomed into that plane (filterPlaneId === plane.id), show every individual object!
        const shouldCluster = (!filterPlaneId && objs.length > 4);
        const groups = [];
        if(shouldCluster){
          const third = Math.ceil(objs.length / 3);
          groups.push({id:`${plane.id}:clusterL`, label:`${plane.label} [Left 1..${third}]`, shortLabel:`${String(plane.label).slice(0,9)} [L]`, list:objs.slice(0, third)});
          groups.push({id:`${plane.id}:clusterM`, label:`${plane.label} [Mid ${third+1}..${Math.min(objs.length, third*2)}]`, shortLabel:`${String(plane.label).slice(0,9)} [M]`, list:objs.slice(third, third*2)});
          if(objs.length > third*2){
            groups.push({id:`${plane.id}:clusterR`, label:`${plane.label} [Right ${third*2+1}..${objs.length}]`, shortLabel:`${String(plane.label).slice(0,9)} [R]`, list:objs.slice(third*2)});
          }
        } else {
          objs.forEach((o, oIdx)=>{
            groups.push({
              id: `obj:${plane.id}:${o.id || oIdx}`,
              label: `${o.id || plane.label} (${o.class || plane.id})`,
              shortLabel: String(o.id || o.class || plane.label).slice(0, 14),
              list: [o],
              rawObj: o
            });
          });
        }

        for(const g of groups){
          const stFi = [], st0 = [];
          let srcStr = '';
          let hasAnimFrames = false;
          for(const o of g.list){
            if(!srcStr && o.source) srcStr = o.source;
            if(o.frames && o.frames.length > 1) hasAnimFrames = true;
            for(const s of getObjectStrokes(o, fi)){
              if(s && s.length >= 2) stFi.push(s.map(p => [p[0] + offFi.dx, p[1] + offFi.dy]));
            }
            for(const s of getObjectStrokes(o, 0)){
              if(s && s.length >= 2) st0.push(s.map(p => [p[0] + off0.dx, p[1] + off0.dy]));
            }
          }
          if(!stFi.length) continue;
          const bbFi = computeStrokesBBox(stFi, W, H);
          const bb0  = computeStrokesBBox(st0, W, H);
          const camDx = offFi.dx - off0.dx, camDy = offFi.dy - off0.dy;
          const rigDx = (bbFi.cx - bb0.cx) - camDx;
          const rigDy = (bbFi.cy - bb0.cy) - camDy;
          const srcTag = srcStr.startsWith('quickdraw:') ? 'QD' : (hasAnimFrames ? 'RIG' : 'AGENT');
          const tr = [];
          for(let ti = 0; ti < N; ti += Math.max(1, Math.floor(N / 14))){
            const oTi = camOffset(plane.z, ti);
            const cDx = oTi.dx - off0.dx;
            tr.push({ti, cx: bb0.cx + cDx + rigDx * (ti / Math.max(1, N - 1)), cy: bb0.cy + (oTi.dy - off0.dy), camDx: cDx, rigDx: hasAnimFrames ? rigDx : 0});
          }
          parts.push({
            id: g.id,
            label: g.label,
            shortLabel: g.shortLabel,
            planeId: plane.id,
            planeLabel: plane.label,
            z: plane.z,
            k: kMult,
            isChar: false,
            strokes: stFi,
            strokes0: st0,
            bbox: bbFi,
            camShift: {dx: camDx, dy: camDy},
            rigShift: {dx: rigDx, dy: rigDy},
            nStrokes: stFi.length,
            nPts: bbFi.nPts,
            sourceTag: srcTag,
            sourceFull: srcStr || `${g.list.length} object(s) on plane ${plane.label}`,
            color: PART_PALETTE[( ++colorIdx ) % PART_PALETTE.length],
            track: tr
          });
        }
      } else if(curWorm.depth_worms){
        const dwObj = curWorm.depth_worms.find(d => d.id === plane.id);
        if(dwObj && Array.isArray(dwObj.strokes0) && dwObj.strokes0.length){
          const u0 = Number.isFinite(dwObj.u0) ? dwObj.u0 : 0.5;
          const v0 = Number.isFinite(dwObj.v0) ? dwObj.v0 : 0.5;
          const stFi = dwObj.strokes0.map(s => s.map(p => [(u0 + p[0])*W + offFi.dx, (v0 + p[1])*H + offFi.dy]));
          const st0  = dwObj.strokes0.map(s => s.map(p => [(u0 + p[0])*W + off0.dx,  (v0 + p[1])*H + off0.dy]));
          const bbFi = computeStrokesBBox(stFi, W, H);
          const bb0  = computeStrokesBBox(st0, W, H);
          parts.push({
            id: `dw:${plane.id}`,
            label: `${plane.label} (${dwObj.desc || plane.id})`,
            shortLabel: String(plane.label || plane.id).slice(0, 14),
            planeId: plane.id,
            planeLabel: plane.label,
            z: plane.z,
            k: kMult,
            isChar: false,
            strokes: stFi,
            strokes0: st0,
            bbox: bbFi,
            camShift: {dx: offFi.dx - off0.dx, dy: offFi.dy - off0.dy},
            rigShift: {dx: 0, dy: 0},
            nStrokes: stFi.length,
            nPts: bbFi.nPts,
            sourceTag: 'QD',
            sourceFull: dwObj.desc || plane.label,
            color: PART_PALETTE[( ++colorIdx ) % PART_PALETTE.length],
            track: [{ti:0, cx:bb0.cx, cy:bb0.cy, camDx:0, rigDx:0}, {ti:N-1, cx:bbFi.cx, cy:bbFi.cy, camDx:offFi.dx, rigDx:0}]
          });
        }
      }
    }
    return parts;
  }

  function drawPartInRect(ctx, part, fi, tx, ty, tw, th, opts){
    const o = Object.assign({showSeedGhost: true, colorStrokeByIndex: false, showVertices: false}, opts || {});
    if(!part || !part.strokes || !part.strokes.length) return;
    if(part.isChar && !o.colorStrokeByIndex){
      drawSamCutoutInRect(ctx, curWorm, fi, tx, ty, tw, th, {
        cropToMask: true, drawOutline: true, outlineColor: part.color || '#EF9F3A', drawDoodle: true
      });
      return;
    }
    const W = (S && S.W) || curWorm.W || 480;
    const H = (S && S.H) || curWorm.H || 360;
    const allPts = [];
    for(const s of part.strokes) for(const p of s) allPts.push(p);
    if(o.showSeedGhost && part.strokes0){
      for(const s of part.strokes0) for(const p of s) allPts.push(p);
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let visMinX = Infinity, visMinY = Infinity, visMaxX = -Infinity, visMaxY = -Infinity;
    for(const p of allPts){
      if(!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      if(p[0] < minX) minX = p[0]; if(p[1] < minY) minY = p[1];
      if(p[0] > maxX) maxX = p[0]; if(p[1] > maxY) maxY = p[1];
      if(p[0] >= -W*0.1 && p[0] <= W*1.1 && p[1] >= -H*0.1 && p[1] <= H*1.1){
        if(p[0] < visMinX) visMinX = p[0]; if(p[1] < visMinY) visMinY = p[1];
        if(p[0] > visMaxX) visMaxX = p[0]; if(p[1] > visMaxY) visMaxY = p[1];
      }
    }
    if(visMinX < visMaxX && visMinY < visMaxY){
      minX = visMinX; minY = visMinY; maxX = visMaxX; maxY = visMaxY;
    }
    if(!Number.isFinite(minX) || minX >= maxX){ minX = 0; maxX = W; minY = 0; maxY = H; }
    const padX = Math.max(6, (maxX - minX) * 0.12), padY = Math.max(6, (maxY - minY) * 0.14);
    minX -= padX; maxX += padX; minY -= padY; maxY += padY;
    const srcW = Math.max(14, maxX - minX), srcH = Math.max(12, maxY - minY);
    const rawSX = Math.max(4, tw - 6) / srcW;
    const rawSY = Math.max(4, th - 6) / srcH;
    const scaleX = rawSX;
    const scaleY = Math.min(rawSY, Math.max(rawSX, rawSY * 0.80));
    const dw = srcW * scaleX, dh = srcH * scaleY;
    const ox = tx + (tw - dw) * 0.5, oy = ty + (th - dh) * 0.5;

    ctx.save();
    ctx.beginPath(); ctx.rect(tx, ty, tw, th); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    const img = getFrameImg(curWorm, fi);
    if(img){
      ctx.save();
      ctx.globalAlpha = 0.22;
      const clX = Math.max(0, Math.min(W - 16, minX));
      const clY = Math.max(0, Math.min(H - 16, minY));
      ctx.drawImage(img, clX, clY, Math.max(16, Math.min(W - clX, srcW)), Math.max(16, Math.min(H - clY, srcH)), tx, ty, tw, th);
      ctx.restore();
    }

    // Seed f=01 ghost for comparison
    if(o.showSeedGhost && part.strokes0 && fi > 0){
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 159, 58, 0.45)';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([3, 2]);
      for(const s of part.strokes0){
        ctx.beginPath();
        for(let i=0;i<s.length;i++){
          const px = ox + (s[i][0] - minX) * scaleX, py = oy + (s[i][1] - minY) * scaleY;
          if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Paper halo
    ctx.strokeStyle = 'rgba(251, 250, 246, 0.92)';
    ctx.lineWidth = 3.4;
    for(const s of part.strokes){
      ctx.beginPath();
      for(let i=0;i<s.length;i++){
        const px = ox + (s[i][0] - minX) * scaleX, py = oy + (s[i][1] - minY) * scaleY;
        if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Active ink strokes
    part.strokes.forEach((s, sIdx)=>{
      ctx.strokeStyle = o.colorStrokeByIndex ? PART_PALETTE[sIdx % PART_PALETTE.length] : '#161412';
      ctx.lineWidth = o.colorStrokeByIndex ? 2.2 : 1.75;
      ctx.beginPath();
      for(let i=0;i<s.length;i++){
        const px = ox + (s[i][0] - minX) * scaleX, py = oy + (s[i][1] - minY) * scaleY;
        if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if(o.showVertices){
        ctx.fillStyle = o.colorStrokeByIndex ? PART_PALETTE[sIdx % PART_PALETTE.length] : part.color;
        for(let i=0;i<s.length;i+=Math.max(1, Math.floor(s.length/8))){
          const px = ox + (s[i][0] - minX) * scaleX, py = oy + (s[i][1] - minY) * scaleY;
          ctx.beginPath(); ctx.arc(px, py, 2.1, 0, Math.PI*2); ctx.fill();
        }
      }
    });
    ctx.restore();
  }

  function getObjectStrokes(o, fi){
    if(!o) return [];
    if(o.frames && Array.isArray(o.frames[fi]) && o.frames[fi].length > 0){
      return o.frames[fi];
    }
    if(Array.isArray(o.strokes) && o.strokes.length > 0){
      return o.strokes;
    }
    if(Array.isArray(o.frames)){
      for(let d = 1; d < o.frames.length; d++){
        if(fi - d >= 0 && Array.isArray(o.frames[fi - d]) && o.frames[fi - d].length > 0) return o.frames[fi - d];
        if(fi + d < o.frames.length && Array.isArray(o.frames[fi + d]) && o.frames[fi + d].length > 0) return o.frames[fi + d];
      }
    }
    return [];
  }

  function drawSamCutoutInRect(ctx, worm, fi, tx, ty, tw, th, opts){
    const o = Object.assign({cropToMask:false, drawOutline:true, outlineColor:'#EF9F3A', drawDoodle:true, alpha:1.0}, opts||{});
    const img = getFrameImg(worm, fi);
    const W = (S && S.W) || worm.W || 480;
    const H = (S && S.H) || worm.H || 360;

    let polysPx = [];
    if(S && Array.isArray(S.masks) && S.masks[fi] && S.masks[fi].length){
      polysPx = S.masks[fi];
    } else if(worm.frames && worm.frames[fi] && worm.frames[fi].ring && worm.frames[fi].ring.length){
      polysPx = [worm.frames[fi].ring.map(p => [p[0]*W, p[1]*H])];
    }

    let minX = W, minY = H, maxX = 0, maxY = 0;
    for(const poly of polysPx){
      for(const p of poly){
        if(p[0]<minX) minX=p[0]; if(p[1]<minY) minY=p[1];
        if(p[0]>maxX) maxX=p[0]; if(p[1]>maxY) maxY=p[1];
      }
    }
    const strokesPx = (S && S.cast && S.cast.frames && S.cast.frames[fi]) ? S.cast.frames[fi] : null;
    if(strokesPx){
      for(const s of strokesPx){
        for(const p of (s||[])){
          if(p[0]<minX) minX=p[0]; if(p[1]<minY) minY=p[1];
          if(p[0]>maxX) maxX=p[0]; if(p[1]>maxY) maxY=p[1];
        }
      }
    }
    if(minX >= maxX || minY >= maxY){
      minX = W*0.15; maxX = W*0.85; minY = H*0.15; maxY = H*0.85;
    } else {
      const padX = Math.max(12, (maxX-minX)*0.18);
      const padY = Math.max(12, (maxY-minY)*0.18);
      minX = Math.max(0, minX - padX); minY = Math.max(0, minY - padY);
      maxX = Math.min(W, maxX + padX); maxY = Math.min(H, maxY + padY);
    }

    const srcX = o.cropToMask ? minX : 0;
    const srcY = o.cropToMask ? minY : 0;
    const srcW = o.cropToMask ? Math.max(16, maxX - minX) : W;
    const srcH = o.cropToMask ? Math.max(16, maxY - minY) : H;

    const scale = Math.min(tw / srcW, th / srcH);
    const dw = srcW * scale, dh = srcH * scale;
    const ox = tx + (tw - dw) * 0.5;
    const oy = ty + (th - dh) * 0.5;

    ctx.save();
    ctx.globalAlpha = o.alpha;
    if(img && polysPx.length){
      ctx.save();
      ctx.beginPath();
      for(const poly of polysPx){
        if(!poly || poly.length < 3) continue;
        for(let i=0;i<poly.length;i++){
          const px = ox + (poly[i][0] - srcX)*scale;
          const py = oy + (poly[i][1] - srcY)*scale;
          if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      ctx.clip();
      ctx.drawImage(img, srcX, srcY, srcW, srcH, ox, oy, dw, dh);
      ctx.restore();

      if(o.drawOutline){
        ctx.strokeStyle = o.outlineColor;
        ctx.lineWidth = 1.6;
        for(const poly of polysPx){
          if(!poly || poly.length < 3) continue;
          ctx.beginPath();
          for(let i=0;i<poly.length;i++){
            const px = ox + (poly[i][0] - srcX)*scale;
            const py = oy + (poly[i][1] - srcY)*scale;
            if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

    if(o.drawDoodle){
      if(strokesPx && strokesPx.length){
        ctx.strokeStyle = o.doodleColor || '#161412';
        ctx.lineWidth = Math.max(1.2, 2.2 * Math.min(1, scale * 1.4));
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for(const s of strokesPx){
          if(!s || s.length < 2) continue;
          ctx.beginPath();
          for(let i=0;i<s.length;i++){
            const px = ox + (s[i][0] - srcX)*scale;
            const py = oy + (s[i][1] - srcY)*scale;
            if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      } else if(worm.frames && worm.frames[fi] && worm.frames[fi].doodle){
        ctx.strokeStyle = o.doodleColor || '#161412';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for(const s of worm.frames[fi].doodle){
          if(!s || s.length < 2) continue;
          ctx.beginPath();
          for(let i=0;i<s.length;i++){
            const px = ox + (s[i][0]*W - srcX)*scale;
            const py = oy + (s[i][1]*H - srcY)*scale;
            if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function drawPlaneObjectsInRect(ctx, plane, fi, tx, ty, tw, th, cropToPlane){
    const W = (S && S.W) || curWorm.W || 480;
    const H = (S && S.H) || curWorm.H || 360;
    const zRef = (S && S.z_ref) || curWorm.z_ref || 2;
    const objs = (S && Array.isArray(S.objects)) ? S.objects.filter(o => o.plane === plane.id) : [];
    const off = camOffset(plane.z, fi);
    const t = tintForPlane(plane.id, plane.z, zRef);

    // Subtle plane depth tint & archive footage context inside stamp boxes
    if(cropToPlane){
      ctx.save();
      ctx.fillStyle = t.fill;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(tx, ty, tw, th);
      ctx.restore();
    }

    const allStrokes = [];
    for(const o of objs){
      const ost = getObjectStrokes(o, fi);
      if(ost && ost.length){
        for(const s of ost){
          if(s && s.length >= 2){
            allStrokes.push(s.map(p => [p[0] + off.dx, p[1] + off.dy]));
          }
        }
      }
    }

    // Fallback to curWorm.depth_worms if S.objects is not loaded yet or empty for this plane
    if(allStrokes.length === 0 && curWorm && Array.isArray(curWorm.depth_worms)){
      const dwObj = curWorm.depth_worms.find(d => d.id === plane.id) || curWorm.depth_worms.find(d => Math.abs((d.z||0) - (plane.z||0)) < 0.25 && d.role !== 'subject');
      if(dwObj && Array.isArray(dwObj.strokes0) && dwObj.strokes0.length){
        const u0 = Number.isFinite(dwObj.u0) ? dwObj.u0 : 0.5;
        const v0 = Number.isFinite(dwObj.v0) ? dwObj.v0 : 0.5;
        for(const s of dwObj.strokes0){
          if(s && s.length >= 2){
            allStrokes.push(s.map(p => [(u0 + p[0])*W + off.dx, (v0 + p[1])*H + off.dy]));
          }
        }
      }
    }
    if(allStrokes.length === 0){
      const yBand = plane.z >= 6 ? H * 0.28 : (plane.z >= 2.5 ? H * 0.52 : H * 0.78);
      allStrokes.push([
        [W * 0.08 + off.dx, yBand + off.dy],
        [W * 0.35 + off.dx, yBand - 8 + off.dy],
        [W * 0.65 + off.dx, yBand + 6 + off.dy],
        [W * 0.92 + off.dx, yBand - 4 + off.dy]
      ]);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let visMinX = Infinity, visMinY = Infinity, visMaxX = -Infinity, visMaxY = -Infinity;
    const marginX = W * 0.08, marginY = H * 0.08;
    for(const s of allStrokes){
      for(const p of s){
        const x = p[0], y = p[1];
        if(!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if(x < minX) minX = x; if(y < minY) minY = y;
        if(x > maxX) maxX = x; if(y > maxY) maxY = y;
        if(x >= -marginX && x <= W + marginX && y >= -marginY && y <= H + marginY){
          if(x < visMinX) visMinX = x; if(y < visMinY) visMinY = y;
          if(x > visMaxX) visMaxX = x; if(y > visMaxY) visMaxY = y;
        }
      }
    }

    if(visMinX < visMaxX && visMinY < visMaxY){
      minX = visMinX; minY = visMinY; maxX = visMaxX; maxY = visMaxY;
    }

    if(!cropToPlane || minX >= maxX || minY >= maxY || !Number.isFinite(minX)){
      minX = 0; minY = 0; maxX = W; maxY = H;
    } else {
      const padX = Math.max(8, (maxX - minX) * 0.10);
      const padY = Math.max(6, (maxY - minY) * 0.14);
      minX -= padX; minY -= padY;
      maxX += padX; maxY += padY;
    }

    const srcW = Math.max(16, maxX - minX);
    const srcH = Math.max(12, maxY - minY);
    const rawScaleX = Math.max(4, tw - 4) / srcW;
    const rawScaleY = Math.max(4, th - 4) / srcH;
    const scaleX = cropToPlane ? rawScaleX : Math.min(rawScaleX, rawScaleY);
    const scaleY = cropToPlane
      ? Math.min(rawScaleY, Math.max(rawScaleX, rawScaleY * 0.80))
      : Math.min(rawScaleX, rawScaleY);
    const dw = srcW * scaleX, dh = srcH * scaleY;
    const ox = tx + (tw - dw) * 0.5, oy = ty + (th - dh) * 0.5;

    // Draw archive image band behind cropped plane stamps so you see the footage region + ink strokes together
    const img = getFrameImg(curWorm, fi);
    if(cropToPlane && img){
      ctx.save();
      ctx.globalAlpha = allStrokes.length ? 0.24 : 0.65;
      const clX = Math.max(0, Math.min(W - 16, minX));
      const clY = Math.max(0, Math.min(H - 16, minY));
      const clW = Math.max(16, Math.min(W - clX, srcW));
      const clH = Math.max(16, Math.min(H - clY, srcH));
      ctx.drawImage(img, clX, clY, clW, clH, tx, ty, tw, th);
      ctx.restore();
    }

    if(allStrokes.length){
      ctx.save();
      ctx.beginPath();
      ctx.rect(tx, ty, tw, th);
      ctx.clip();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Paper-white halo + cel fill so every stroke in Grass, Young giraffes, Trees, Far treeline, Sky pops clearly
      ctx.strokeStyle = 'rgba(251, 250, 246, 0.90)';
      ctx.lineWidth = 3.2;
      for(const s of allStrokes){
        ctx.beginPath();
        for(let i=0;i<s.length;i++){
          const px = ox + (s[i][0] - minX) * scaleX;
          const py = oy + (s[i][1] - minY) * scaleY;
          if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = '#161412';
      ctx.lineWidth = cropToPlane ? 1.65 : 1.45;
      for(const s of allStrokes){
        ctx.beginPath();
        for(let i=0;i<s.length;i++){
          const px = ox + (s[i][0] - minX) * scaleX;
          const py = oy + (s[i][1] - minY) * scaleY;
          if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawUpright3DCard(ctx, cx, cy, cw, ch, fi, opts){
    const o = Object.assign({
      plane: null,
      borderColor: '#FFFFFF',
      borderWidth: 1.8,
      bgFill: '#FBFAF6',
      alpha: 1.0,
      cropToMask: true,
      label: null,
      labelColor: '#FFFFFF',
      skewY: -0.16,
      skewX: -0.09,
      butterSlab: true,
      slabDepth: 5.5,
      noHit: false,
      togglePlane: false
    }, opts || {});

    if(!o.noHit){
      pushHitBox({
        x: cx - cw * 0.56,
        y: cy - ch * 0.56,
        w: cw * 1.12,
        h: ch * 1.12,
        fi: fi,
        planeId: (o.plane && o.plane.id) ? o.plane.id : null,
        togglePlane: Boolean(o.togglePlane)
      });
    }

    ctx.save();
    ctx.globalAlpha = o.alpha;
    ctx.translate(cx, cy);
    ctx.transform(1, o.skewY, o.skewX, 1, 0, 0);

    const x0 = -cw * 0.5;
    const y0 = -ch * 0.5;

    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(x0 + 3, y0 + 4, cw + (o.butterSlab ? o.slabDepth : 0), ch + (o.butterSlab ? o.slabDepth * 0.65 : 0));

    // 3D Butter-Slab extruded right and bottom faces
    if(o.butterSlab && o.slabDepth > 0){
      const sd = o.slabDepth;
      const sy = sd * 0.62;
      ctx.fillStyle = '#E5BE62';
      ctx.beginPath();
      ctx.moveTo(x0 + cw, y0);
      ctx.lineTo(x0 + cw + sd, y0 + sy);
      ctx.lineTo(x0 + cw + sd, y0 + ch + sy);
      ctx.lineTo(x0 + cw, y0 + ch);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#C4942D';
      ctx.beginPath();
      ctx.moveTo(x0, y0 + ch);
      ctx.lineTo(x0 + cw, y0 + ch);
      ctx.lineTo(x0 + cw + sd, y0 + ch + sy);
      ctx.lineTo(x0 + sd, y0 + ch + sy);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = o.bgFill;
    ctx.fillRect(x0, y0, cw, ch);

    const footerH = o.label ? 14 : 0;
    const contentH = ch - footerH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 1.5, y0 + 1.5, cw - 3, Math.max(10, contentH - 2));
    ctx.clip();

    const img = getFrameImg(curWorm, fi);
    if(o.plane && o.plane.id !== 'char'){
      if(img){
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.drawImage(img, x0 + 1.5, y0 + 1.5, cw - 3, contentH - 2);
        ctx.restore();
      }
      drawPlaneObjectsInRect(ctx, o.plane, fi, x0 + 2, y0 + 2, cw - 4, contentH - 4, true);
    } else {
      if(img && !o.cropToMask){
        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.drawImage(img, x0 + 1.5, y0 + 1.5, cw - 3, contentH - 2);
        ctx.restore();
      }
      drawSamCutoutInRect(ctx, curWorm, fi, x0 + 2, y0 + 2, cw - 4, contentH - 4, {
        cropToMask: o.cropToMask,
        drawOutline: true,
        outlineColor: o.borderColor === '#FFFFFF' ? '#EF9F3A' : o.borderColor,
        drawDoodle: true,
        doodleColor: '#161412'
      });
    }
    ctx.restore();

    if(o.label){
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 + 1, y0 + ch - footerH, cw - 2, footerH - 1);
      ctx.clip();
      ctx.fillStyle = 'rgba(12, 13, 18, 0.90)';
      ctx.fillRect(x0 + 1, y0 + ch - footerH, cw - 2, footerH - 1);
      ctx.fillStyle = o.labelColor;
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.fillText(o.label, x0 + 4, y0 + ch - 4);
      ctx.restore();
    }

    ctx.strokeStyle = o.borderColor;
    ctx.lineWidth = o.borderWidth;
    ctx.strokeRect(x0, y0, cw, ch);

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#161412';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function renderParallelTimelinesMode(ctx, W, H, fi, N, planes, zRef){
    const dark = parallelDark;
    if(dark){
      const bg = ctx.createRadialGradient(W*0.42, H*0.46, 20, W*0.5, H*0.5, W*0.75);
      bg.addColorStop(0, '#141720');
      bg.addColorStop(1, '#06070A');
      ctx.fillStyle = bg;
    } else {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#EFE6D5');
      bg.addColorStop(1, '#E4D7C0');
      ctx.fillStyle = bg;
    }
    ctx.fillRect(0, 0, W, H);

    const keys = (S && S.keys) || curWorm.keys || {};
    const drawnArr = (keys.drawn && keys.drawn.length >= 2)
      ? keys.drawn.slice()
      : [0, Math.floor(N*0.25), Math.floor(N*0.5), Math.floor(N*0.75), Math.max(0, N-1)];
    const drawnSet = new Set(drawnArr);
    const lineRGB = dark ? '255,255,255' : '22,20,18';

    // Sub-mode: ALL SLICES (Flat Butter-Pat Contact Sheet of all N frames — click any slice)
    if(parallelSubMode === 'slices'){
      const pad = 10;
      const availW = W - pad * 2;
      const availH = H - pad * 2;
      const aspect = availW / Math.max(1, availH);
      const cols = Math.max(4, Math.min(9, Math.ceil(Math.sqrt(N * aspect * 0.85))));
      const rows = Math.max(1, Math.ceil(N / cols));
      const gap = 6;
      const cellW = Math.floor((availW - gap * (cols - 1)) / cols);
      const cellH = Math.floor((availH - gap * (rows - 1)) / rows);

      for(let ti = 0; ti < N; ti++){
        const c = ti % cols;
        const r = Math.floor(ti / cols);
        const x = pad + c * (cellW + gap);
        const y = pad + r * (cellH + gap);
        const isCur = (ti === fi);
        const isKey = (ti === 0 || drawnSet.has(ti));

        // 3D butter-pat bevel
        ctx.fillStyle = isCur ? '#EF9F3A' : '#C4942D';
        ctx.fillRect(x + 2.5, y + 2.5, cellW, cellH);

        ctx.fillStyle = isCur ? '#FFFDF4' : '#FBFAF6';
        ctx.fillRect(x, y, cellW, cellH);

        const footH = 13;
        const bodyH = Math.max(12, cellH - footH);
        const img = getFrameImg(curWorm, ti);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, y + 1, cellW - 2, bodyH - 1);
        ctx.clip();
        if(img){
          ctx.globalAlpha = isCur ? 0.42 : 0.25;
          ctx.drawImage(img, x + 1, y + 1, cellW - 2, bodyH - 1);
          ctx.globalAlpha = 1;
        }
        const visList = planes.filter(p => isPlaneVisible(p.id));
        for(const p of visList){
          if(p.id !== 'char'){
            drawPlaneObjectsInRect(ctx, p, ti, x + 2, y + 2, cellW - 4, bodyH - 3, false);
          }
        }
        if(isPlaneVisible('char') || visList.length === 0){
          drawSamCutoutInRect(ctx, curWorm, ti, x + 2, y + 2, cellW - 4, bodyH - 3, {
            cropToMask: visList.length === 1 && visList[0].id === 'char',
            drawOutline: true,
            outlineColor: isCur ? '#EF9F3A' : (isKey ? '#2E7A4A' : '#8A6114'),
            drawDoodle: true,
            doodleColor: '#161412'
          });
        }
        ctx.restore();

        ctx.fillStyle = isCur ? '#EF9F3A' : 'rgba(18,16,14,0.88)';
        ctx.fillRect(x + 1, y + cellH - footH, cellW - 2, footH - 1);
        ctx.fillStyle = isCur ? '#161412' : (isKey ? '#FBE6C8' : '#FFFFFF');
        ctx.font = '700 8.5px "JetBrains Mono", monospace';
        const tag = `f${String(ti+1).padStart(2,'0')}${ti===0?' SEED':(isKey?' KEY':'')}`;
        ctx.fillText(tag, x + 4, y + cellH - 3.5);

        ctx.strokeStyle = isCur ? '#EF9F3A' : (isKey ? '#F5C469' : 'rgba(255,255,255,0.55)');
        ctx.lineWidth = isCur ? 2.4 : 1.1;
        ctx.strokeRect(x, y, cellW, cellH);

        pushHitBox({x, y, w: cellW, h: cellH, fi: ti, planeId: null, togglePlane: false});
      }
      return;
    }

    const topSafe = 14;
    const botSafe = 14;

    const vx = W * 0.06, vy = H * 0.22;
    const fx = W * 0.90, fy = H * 0.78;

    function spinePt(u){
      const p = Math.pow(Math.max(0, Math.min(1, u)), 0.92);
      return {
        x: vx + p * (fx - vx),
        y: vy + p * (fy - vy),
        s: 0.52 + p * 0.64
      };
    }

    const visPlanes = planes.filter(p => isPlaneVisible(p.id));
    const activeList = visPlanes.length ? visPlanes : planes;
    const K = Math.max(1, activeList.length);
    const RAIL_COLORS = ['#EF9F3A', '#FF453A', '#32D74B', '#409CFF', '#BF5AF2', '#FFD60A', '#64D2FF'];
    const baseRad = Math.min(W, H) * 0.31;

    function railAngle(rIdx){
      return -Math.PI * 0.72 + (rIdx / Math.max(2, K)) * (Math.PI * 2);
    }

    function railPt(rIdx, u){
      const c = spinePt(u);
      const ang = railAngle(rIdx);
      const radScale = Math.max(0.68, c.s);
      const rx = Math.cos(ang) * baseRad * 1.12 * radScale;
      const ry = Math.sin(ang) * baseRad * 0.82 * radScale;
      return {x: c.x + rx, y: c.y + ry, s: c.s, ang, radScale};
    }

    // Sub-mode: BUTTER LOAF (All time slices AND all parallel depth rails sliced simultaneously!)
    if(parallelSubMode === 'butter'){
      const maxSlices = Math.min(N, K > 2 ? 10 : 14);
      const sliceSet = new Set([0, N - 1, fi]);
      drawnArr.forEach(k => { if(k >= 0 && k < N) sliceSet.add(k); });
      for(let s = 0; s < maxSlices; s++){
        const ti = maxSlices === 1 ? 0 : Math.round((s / (maxSlices - 1)) * (N - 1));
        sliceSet.add(ti);
      }
      const sliceFrames = Array.from(sliceSet).sort((a, b) => a - b);

      // Draw all parallel rail lines + correspondence fans
      const cStart = spinePt(0.03), cEnd = spinePt(0.97);
      ctx.strokeStyle = `rgba(${lineRGB}, 0.55)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cStart.x, cStart.y); ctx.lineTo(cEnd.x, cEnd.y); ctx.stroke();

      for(let rIdx = 0; rIdx < K; rIdx++){
        const plane = activeList[rIdx];
        const isSubj = (plane.id === 'char');
        const col = isSubj ? '#EF9F3A' : RAIL_COLORS[rIdx % RAIL_COLORS.length];
        const p0 = railPt(rIdx, 0.05), p1 = railPt(rIdx, 0.95);
        ctx.strokeStyle = col;
        ctx.globalAlpha = isSubj ? 0.85 : 0.55;
        ctx.lineWidth = isSubj ? 2.0 : 1.2;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      let activePt = spinePt(0.5);
      const sliceNodes = sliceFrames.map(ti => {
        const rawU = N > 1 ? (ti / (N - 1)) : 0.5;
        let partShift = 0;
        if(ti < fi) partShift = -0.05;
        else if(ti > fi) partShift = 0.05;
        const u = Math.max(0.04, Math.min(0.96, 0.08 + rawU * 0.84 + partShift));
        const pt = spinePt(u);
        if(ti === fi) activePt = pt;
        return {ti, rawU, u, pt};
      });

      // Draw ALL slices across ALL rails simultaneously in back-to-front order (every slice on every rail is clickable!)
      for(const sn of sliceNodes){
        if(sn.ti === fi) continue;
        const isKey = (sn.ti === 0 || drawnSet.has(sn.ti));

        // First draw outer depth-plane butter slices for this time step sn.ti
        for(let rIdx = 0; rIdx < K; rIdx++){
          const plane = activeList[rIdx];
          const isSubj = (plane.id === 'char');
          if(isSubj && K > 1) continue;
          const kSpeed = zRef / Math.max(0.3, plane.z);
          const fLayer = Math.max(0, Math.min(N - 1, Math.round(sn.ti * Math.min(1.2, Math.max(0.35, kSpeed)))));
          const rp = railPt(rIdx, sn.u);
          const cx = Math.max(36, Math.min(W - 36, rp.x));
          const cy = Math.max(topSafe + 26, Math.min(H - botSafe - 26, rp.y));
          const col = RAIL_COLORS[rIdx % RAIL_COLORS.length];

          // White correspondence ray from spine slice to rail slice
          ctx.strokeStyle = `rgba(${lineRGB}, ${isKey ? 0.42 : 0.20})`;
          ctx.lineWidth = 0.85;
          ctx.beginPath(); ctx.moveTo(sn.pt.x, sn.pt.y); ctx.lineTo(cx, cy); ctx.stroke();

          const pw = Math.round(48 * sn.pt.s);
          const ph = Math.round(40 * sn.pt.s);
          drawUpright3DCard(ctx, cx, cy, pw, ph, fLayer, {
            plane: plane,
            borderColor: col,
            borderWidth: 1.3,
            bgFill: '#FFFDF5',
            alpha: 0.82,
            cropToMask: false,
            butterSlab: true,
            slabDepth: Math.max(3, 4.5 * sn.pt.s),
            togglePlane: true,
            label: isKey ? `z=${plane.z} f${fLayer+1}` : null,
            labelColor: col
          });
        }

        // Then draw central spine butter slice for time step sn.ti
        const cw = Math.round(64 * sn.pt.s);
        const ch = Math.round(52 * sn.pt.s);
        drawUpright3DCard(ctx, sn.pt.x, sn.pt.y, cw, ch, sn.ti, {
          plane: null,
          borderColor: isKey ? '#F5C469' : `rgba(${lineRGB}, 0.78)`,
          borderWidth: isKey ? 1.8 : 1.2,
          bgFill: '#FFFDF5',
          alpha: 0.92,
          cropToMask: true,
          butterSlab: true,
          slabDepth: Math.max(4, 6.0 * sn.pt.s),
          label: `f${String(sn.ti+1).padStart(2,'0')}`,
          labelColor: isKey ? '#FFD60A' : '#FFFFFF'
        });
      }

      // Now draw the active cross-section ring at fi parting all rails open at once
      const popX = Math.max(66, Math.min(W - 66, activePt.x - 18));
      const popY = Math.max(topSafe + 48, Math.min(H - botSafe - 48, activePt.y - 14));

      ctx.save();
      ctx.strokeStyle = '#EF9F3A';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.ellipse(activePt.x, activePt.y, baseRad * 1.08, baseRad * 0.80, -0.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const planeCards = [];
      for(let rIdx = 0; rIdx < K; rIdx++){
        const plane = activeList[rIdx];
        if(plane.id === 'char' && K > 1) continue;
        const rp = railPt(rIdx, N > 1 ? (0.08 + (fi / (N - 1)) * 0.84) : 0.5);
        const cx = Math.max(46, Math.min(W - 46, rp.x));
        const cy = Math.max(topSafe + 34, Math.min(H - botSafe - 34, rp.y));
        const col = RAIL_COLORS[rIdx % RAIL_COLORS.length];
        planeCards.push({plane, cx, cy, col});
      }

      ctx.save();
      ctx.strokeStyle = `rgba(${lineRGB}, 0.90)`;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(activePt.x, activePt.y);
      ctx.lineTo(popX, popY);
      ctx.stroke();
      for(const pc of planeCards){
        ctx.beginPath();
        ctx.moveTo(activePt.x, activePt.y);
        ctx.lineTo(pc.cx, pc.cy);
        ctx.stroke();
      }
      ctx.restore();

      for(const pc of planeCards){
        const shortLbl = String(pc.plane.label || pc.plane.id).split('(')[0].trim().slice(0, 9);
        drawUpright3DCard(ctx, pc.cx, pc.cy, 68, 56, fi, {
          plane: pc.plane,
          borderColor: pc.col,
          borderWidth: 2.0,
          bgFill: '#FFFDF5',
          cropToMask: false,
          butterSlab: true,
          slabDepth: 5.5,
          togglePlane: true,
          label: `${shortLbl} z=${pc.plane.z}`,
          labelColor: pc.col
        });
      }

      drawUpright3DCard(ctx, popX, popY, 92, 76, fi, {
        plane: null,
        borderColor: '#EF9F3A',
        borderWidth: 2.8,
        bgFill: '#FFFDF5',
        cropToMask: false,
        butterSlab: true,
        slabDepth: 8.5,
        label: `SLICE f${String(fi+1).padStart(2,'0')}/${String(N).padStart(2,'0')}`,
        labelColor: '#EF9F3A'
      });
      return;
    }

    const uPlay = 0.24 + (N > 1 ? (fi / (N - 1)) : 0.5) * 0.54;
    const spPlay = spinePt(uPlay);

    if(parallelSubMode === 'dual'){
      const redOff  = {dx: -118, dy: 72};
      const blueOff = {dx: 122,  dy: -54};

      function redPt(u){
        const c = spinePt(u);
        return {x: c.x + redOff.dx * c.s, y: c.y + redOff.dy * c.s, s: c.s};
      }
      function bluePt(u){
        const c = spinePt(u);
        return {x: c.x + blueOff.dx * c.s, y: c.y + blueOff.dy * c.s, s: c.s};
      }

      const nBlocks = Math.max(4, Math.min(7, drawnArr.length));
      for(let b = 0; b < nBlocks; b++){
        const uIn0 = (b / nBlocks) * 0.88;
        const uIn1 = ((b + 1) / nBlocks) * 0.88;
        const uOut0 = Math.min(1.0, uIn0 * 1.12);
        const uOut1 = Math.min(1.0, uIn1 * 1.12);

        const c0 = spinePt(uIn0), c1 = spinePt(uIn1);
        const r0 = redPt(uOut0),  r1 = redPt(uOut1);
        const bl0 = bluePt(uOut0), bl1 = bluePt(uOut1);

        ctx.fillStyle = (b % 2 === 0)
          ? `rgba(${lineRGB}, ${dark ? 0.14 : 0.11})`
          : `rgba(${lineRGB}, ${dark ? 0.04 : 0.03})`;
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y);
        ctx.lineTo(r1.x, r1.y); ctx.lineTo(r0.x, r0.y);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = (b % 2 === 1)
          ? `rgba(${lineRGB}, ${dark ? 0.14 : 0.11})`
          : `rgba(${lineRGB}, ${dark ? 0.04 : 0.03})`;
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y);
        ctx.lineTo(bl1.x, bl1.y); ctx.lineTo(bl0.x, bl0.y);
        ctx.closePath();
        ctx.fill();

        const subRays = 12;
        ctx.strokeStyle = `rgba(${lineRGB}, ${dark ? 0.36 : 0.28})`;
        ctx.lineWidth = 0.75;
        for(let r = 0; r <= subRays; r++){
          const fSub = r / subRays;
          const uc = uIn0 + fSub * (uIn1 - uIn0);
          const uo = uOut0 + fSub * (uOut1 - uOut0);
          const pc = spinePt(uc);
          const pr = redPt(uo);
          const pb = bluePt(uo);
          ctx.beginPath();
          ctx.moveTo(pc.x, pc.y); ctx.lineTo(pr.x, pr.y);
          ctx.moveTo(pc.x, pc.y); ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
      }

      const cStart = spinePt(0), cEnd = spinePt(1);
      const rStart = redPt(0),   rEnd = redPt(1);
      const bStart = bluePt(0),  bEnd = bluePt(1);

      ctx.strokeStyle = `rgba(${lineRGB}, 0.75)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cStart.x, cStart.y); ctx.lineTo(cEnd.x, cEnd.y); ctx.stroke();

      ctx.strokeStyle = '#FF3B30';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(rStart.x, rStart.y); ctx.lineTo(rEnd.x, rEnd.y); ctx.stroke();

      ctx.strokeStyle = '#2E7CF6';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(bStart.x, bStart.y); ctx.lineTo(bEnd.x, bEnd.y); ctx.stroke();

      const bgPlane = planes.find(p => p.id !== 'char') || planes[0];

      // Draw distributed slices along ALL 3 rails (Red, Spine, Blue) across time simultaneously!
      for(let b = 0; b < nBlocks; b++){
        const uStep = 0.10 + (b / Math.max(1, nBlocks - 1)) * 0.80;
        if(Math.abs(uStep - uPlay) < 0.08) continue;
        const ti = Math.max(0, Math.min(N - 1, Math.round((b / Math.max(1, nBlocks - 1)) * (N - 1))));
        const fR = Math.max(0, Math.min(N - 1, Math.round(ti * 0.5)));
        const fB = Math.max(0, Math.min(N - 1, Math.round(ti * 0.5 + N * 0.25)));
        const pc = spinePt(uStep);
        const pr = redPt(uStep);
        const pb = bluePt(uStep);
        const cw = Math.round(54 * pc.s), ch = Math.round(44 * pc.s);

        drawUpright3DCard(ctx, Math.max(40, Math.min(W-40, pb.x)), Math.max(topSafe+26, Math.min(H-botSafe-26, pb.y)), cw, ch, fB, {
          plane: bgPlane, borderColor: '#2E7CF6', borderWidth: 1.3, alpha: 0.78, cropToMask: false, butterSlab: true, slabDepth: 3.5
        });
        drawUpright3DCard(ctx, pc.x, pc.y, cw, ch, ti, {
          plane: null, borderColor: `rgba(${lineRGB}, 0.65)`, borderWidth: 1.2, alpha: 0.80, cropToMask: false, butterSlab: true, slabDepth: 3.5
        });
        drawUpright3DCard(ctx, Math.max(40, Math.min(W-40, pr.x)), Math.max(topSafe+26, Math.min(H-botSafe-26, pr.y)), cw, ch, fR, {
          plane: null, borderColor: '#FF3B30', borderWidth: 1.4, alpha: 0.82, cropToMask: true, butterSlab: true, slabDepth: 3.5
        });
      }

      const rPlay = redPt(uPlay);
      const bPlay = bluePt(uPlay);
      const ringRx = Math.hypot(bPlay.x - rPlay.x, bPlay.y - rPlay.y) * 0.54;
      const ringRy = ringRx * 0.88;

      ctx.save();
      ctx.strokeStyle = `rgba(${lineRGB}, 0.54)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(spPlay.x, spPlay.y, ringRx, ringRy, -0.15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const fStretched1 = Math.max(0, Math.min(N - 1, Math.round(fi * 0.5)));
      const fStretched2 = Math.max(0, Math.min(N - 1, Math.round(fi * 0.5 + N * 0.25)));

      const bx = Math.max(54, Math.min(W - 54, bPlay.x));
      const by = Math.max(topSafe + 38, Math.min(H - botSafe - 38, bPlay.y));
      const rx = Math.max(54, Math.min(W - 54, rPlay.x));
      const ry = Math.max(topSafe + 42, Math.min(H - botSafe - 42, rPlay.y));

      drawUpright3DCard(ctx, bx, by, 84, 70, fStretched2, {
        plane: bgPlane,
        borderColor: '#2E7CF6',
        borderWidth: 2.0,
        cropToMask: false,
        label: `out 2 · f${fStretched2+1}`,
        labelColor: '#6CA6FF'
      });

      drawUpright3DCard(ctx, spPlay.x, spPlay.y, 86, 72, fi, {
        plane: null,
        borderColor: '#FFFFFF',
        borderWidth: 2.2,
        cropToMask: false,
        label: `spine · f${fi+1}/${N}`,
        labelColor: '#EF9F3A'
      });

      drawUpright3DCard(ctx, rx, ry, 94, 78, fStretched1, {
        plane: null,
        borderColor: '#FF3B30',
        borderWidth: 2.4,
        cropToMask: true,
        label: `out 1 (1/2x) · f${fStretched1+1}`,
        labelColor: '#FF6961'
      });

      ctx.save();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(255,255,255,0.75)';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(spPlay.x, spPlay.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Sub-mode: Radial Multi-Worm Fan (with slices distributed along all K rails simultaneously!)
    const nSegs = Math.max(4, Math.min(6, drawnArr.length));
    for(let rIdx = 0; rIdx < K; rIdx++){
      const plane = activeList[rIdx];
      const isSubj = (plane.id === 'char');
      const stretchFactor = 1 + (rIdx / Math.max(1, K)) * 0.32;

      for(let s = 0; s < nSegs; s++){
        const uIn0 = (s / nSegs) * 0.82;
        const uIn1 = ((s + 1) / nSegs) * 0.82;
        const uOut0 = Math.min(1.0, uIn0 * stretchFactor);
        const uOut1 = Math.min(1.0, uIn1 * stretchFactor);

        if(isSubj && s % 2 === 0){
          const c0 = spinePt(uIn0), c1 = spinePt(uIn1);
          const p0 = railPt(rIdx, uOut0), p1 = railPt(rIdx, uOut1);
          ctx.fillStyle = `rgba(${lineRGB}, ${dark ? 0.13 : 0.09})`;
          ctx.beginPath();
          ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y);
          ctx.lineTo(p1.x, p1.y); ctx.lineTo(p0.x, p0.y);
          ctx.closePath();
          ctx.fill();
        }

        const nFan = isSubj ? 8 : 5;
        ctx.strokeStyle = `rgba(${lineRGB}, ${isSubj ? (dark ? 0.40 : 0.32) : (dark ? 0.20 : 0.16)})`;
        ctx.lineWidth = isSubj ? 0.85 : 0.65;
        for(let k = 0; k <= nFan; k++){
          const fSub = k / nFan;
          const uc = uIn0 + fSub * (uIn1 - uIn0);
          const uo = uOut0 + fSub * (uOut1 - uOut0);
          const pc = spinePt(uc);
          const pr = railPt(rIdx, uo);
          ctx.beginPath();
          ctx.moveTo(pc.x, pc.y);
          ctx.lineTo(pr.x, pr.y);
          ctx.stroke();
        }
      }

      const pStart = railPt(rIdx, 0), pEnd = railPt(rIdx, 1);
      ctx.strokeStyle = isSubj ? '#EF9F3A' : `rgba(${lineRGB}, 0.52)`;
      ctx.lineWidth = isSubj ? 2.0 : 1.15;
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();
    }

    const c0 = spinePt(0), c1 = spinePt(1);
    ctx.strokeStyle = `rgba(${lineRGB}, 0.80)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.stroke();

    // Draw distributed slices along all K radial rails & central spine across time simultaneously
    for(let s = 0; s < nSegs; s++){
      const uStep = 0.12 + (s / Math.max(1, nSegs - 1)) * 0.76;
      if(Math.abs(uStep - uPlay) < 0.08) continue;
      const ti = Math.max(0, Math.min(N - 1, Math.round((s / Math.max(1, nSegs - 1)) * (N - 1))));
      const pe = spinePt(uStep);
      drawUpright3DCard(ctx, pe.x, pe.y, Math.round(52 * pe.s), Math.round(42 * pe.s), ti, {
        plane: null, borderColor: `rgba(${lineRGB}, 0.55)`, borderWidth: 1.1, alpha: 0.72, cropToMask: false, butterSlab: true, slabDepth: 3
      });
      for(let rIdx = 0; rIdx < K; rIdx++){
        const plane = activeList[rIdx];
        const isSubj = (plane.id === 'char');
        const col = isSubj ? '#EF9F3A' : RAIL_COLORS[rIdx % RAIL_COLORS.length];
        const rp = railPt(rIdx, uStep);
        const cx = Math.max(38, Math.min(W - 38, rp.x));
        const cy = Math.max(topSafe + 24, Math.min(H - botSafe - 24, rp.y));
        const kSpeed = zRef / Math.max(0.3, plane.z);
        const fLayer = isSubj ? ti : Math.max(0, Math.min(N - 1, Math.round(ti * Math.min(1.2, Math.max(0.35, kSpeed)))));
        drawUpright3DCard(ctx, cx, cy, Math.round(46 * rp.s), Math.round(38 * rp.s), fLayer, {
          plane: isSubj ? null : plane, borderColor: col, borderWidth: 1.2, alpha: 0.75, cropToMask: isSubj, butterSlab: true, slabDepth: 3, togglePlane: !isSubj
        });
      }
    }

    const ringScale = Math.max(0.70, spPlay.s);
    const ringR = baseRad * ringScale;
    ctx.save();
    ctx.strokeStyle = `rgba(${lineRGB}, 0.62)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(spPlay.x, spPlay.y, ringR * 1.15, ringR * 0.85, -0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const railCards = [];
    for(let rIdx = 0; rIdx < K; rIdx++){
      const plane = activeList[rIdx];
      const rawPt = railPt(rIdx, uPlay);
      const isSubj = (plane.id === 'char');
      const cw = isSubj ? 82 : 68;
      const ch = isSubj ? 70 : 58;
      const cx = Math.max(cw * 0.55 + 8, Math.min(W - cw * 0.55 - 8, rawPt.x));
      const cy = Math.max(topSafe + ch * 0.55, Math.min(H - botSafe - ch * 0.55, rawPt.y));
      const col = isSubj ? '#EF9F3A' : RAIL_COLORS[rIdx % RAIL_COLORS.length];
      const kSpeed = zRef / Math.max(0.3, plane.z);
      const fLayer = isSubj
        ? fi
        : Math.max(0, Math.min(N - 1, Math.round(fi * Math.min(1.2, Math.max(0.35, kSpeed)))));
      railCards.push({rIdx, plane, cx, cy, cw, ch, col, kSpeed, fLayer, isSubj});
    }

    ctx.save();
    ctx.strokeStyle = `rgba(${lineRGB}, 0.85)`;
    ctx.lineWidth = 1.5;
    for(const rc of railCards){
      ctx.beginPath();
      ctx.moveTo(spPlay.x, spPlay.y);
      ctx.lineTo(rc.cx, rc.cy);
      ctx.stroke();
    }
    ctx.restore();

    drawUpright3DCard(ctx, spPlay.x, spPlay.y, 70, 60, fi, {
      plane: null,
      borderColor: '#FFFFFF',
      borderWidth: 2.0,
      cropToMask: false,
      label: `Spine f${fi+1}`,
      labelColor: '#FFFFFF'
    });

    railCards.sort((a, b) => a.cy - b.cy);
    for(const rc of railCards){
      const shortLbl = String(rc.plane.label || rc.plane.id).split('(')[0].trim().slice(0, 10);
      drawUpright3DCard(ctx, rc.cx, rc.cy, rc.cw, rc.ch, rc.fLayer, {
        plane: rc.isSubj ? null : rc.plane,
        borderColor: rc.col,
        borderWidth: rc.isSubj ? 2.4 : 1.7,
        cropToMask: rc.isSubj,
        togglePlane: !rc.isSubj,
        label: `${shortLbl} z=${rc.plane.z}`,
        labelColor: rc.col
      });
    }
  }

  function renderSingleStageView(ctx, W, H, fi, vMode){
    const img = getFrameImg(curWorm, fi);

    if(vMode === 'footage'){
      if(img) ctx.drawImage(img, 0, 0, W, H);
      return;
    }

    if(vMode === 'masks'){
      if(img){
        ctx.save(); ctx.globalAlpha = 0.30; ctx.drawImage(img, 0, 0, W, H); ctx.restore();
      }
      const masks = (S && S.masks && S.masks[fi]) ? S.masks[fi] :
        ((curWorm.frames && curWorm.frames[fi] && curWorm.frames[fi].ring)
          ? [curWorm.frames[fi].ring.map(p=>[p[0]*W, p[1]*H])] : []);
      masks.forEach((poly, idx)=>{
        if(!poly || poly.length < 3) return;
        ctx.beginPath();
        poly.forEach((p, j)=>{ if(j===0) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]); });
        ctx.closePath();
        ctx.fillStyle = idx===0 ? 'rgba(239, 159, 58, 0.52)' : 'rgba(46, 122, 74, 0.42)';
        ctx.fill();
        ctx.strokeStyle = idx===0 ? '#8A4A05' : '#2E7A4A';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      return;
    }

    if(vMode === 'cutout'){
      if(img){
        ctx.save(); ctx.globalAlpha = 0.16; ctx.drawImage(img, 0, 0, W, H); ctx.restore();
      }
      drawSamCutoutInRect(ctx, curWorm, fi, 0, 0, W, H, {
        cropToMask: false, drawOutline: true, outlineColor: '#EF9F3A', drawDoodle: true
      });
      return;
    }

    if(vMode === 'xray'){
      if(img){
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.drawImage(img, 0, 0, W, H);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(251, 250, 246, 0.72)';
      ctx.fillRect(0, 0, W, H);

      const parts = extractShotParts(fi, zoomPlaneId);
      const labelQueue = [];

      for(const part of parts){
        if(!isPlaneVisible(part.planeId)) continue;
        // Skip whole-character aggregate box in X-Ray if individual character strokes are also present
        if(part.kind === 'char_whole' && parts.some(p => p.kind === 'char_stroke')) continue;

        const isSel = (part.id === selectedPartId);
        const isHov = (part.id === hoveredPartId);
        const st = part.strokes || [];
        if(!st.length) continue;

        const dx = part.off.dx, dy = part.off.dy;
        drawStrokes(ctx, st, {color: 'rgba(251,250,246,0.92)', width: (isSel || isHov) ? 6.0 : 4.2, dx, dy});
        drawStrokes(ctx, st, {color: part.color, width: (isSel || isHov) ? 3.2 : 2.1, dx, dy});

        const bx = part.bbox.x0 + dx, by = part.bbox.y0 + dy;
        const bw = part.bbox.w, bh = part.bbox.h;
        ctx.save();
        ctx.strokeStyle = part.color;
        ctx.lineWidth = (isSel || isHov) ? 2.2 : 1.1;
        ctx.globalAlpha = (isSel || isHov) ? 0.96 : 0.52;
        ctx.setLineDash((isSel || isHov) ? [] : [3, 2]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.restore();

        stageHitBoxes.push({
          x: bx - 3, y: by - 3, w: Math.max(12, bw + 6), h: Math.max(12, bh + 6),
          partId: part.id, planeId: part.planeId
        });

        // Draw causal vectors from part center: Blue = camera parallax, Amber = intrinsic rig motion
        const cx = part.bbox.cx + dx, cy = part.bbox.cy + dy;
        const camLen = Math.hypot(part.camDisp.dx, part.camDisp.dy);
        if(camLen > 0.6){
          const vx = cx + part.camDisp.dx * 1.35, vy = cy + part.camDisp.dy * 1.35;
          ctx.save();
          ctx.strokeStyle = '#2B6CB0';
          ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(vx, vy); ctx.stroke();
          ctx.fillStyle = '#2B6CB0';
          ctx.beginPath(); ctx.arc(vx, vy, 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        const rigLen = Math.hypot(part.rigDisp.dx, part.rigDisp.dy);
        if(rigLen > 0.6){
          const rx = cx + part.rigDisp.dx * 1.35, ry = cy + part.rigDisp.dy * 1.35;
          ctx.save();
          ctx.strokeStyle = '#D97706';
          ctx.lineWidth = 2.0;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(rx, ry); ctx.stroke();
          ctx.fillStyle = '#D97706';
          ctx.beginPath(); ctx.arc(rx, ry, 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }

        labelQueue.push({
          text: `${part.shortLabel} z=${part.planeZ} [${part.sourceTag}]`,
          x: Math.max(4, Math.min(W - 115, bx)),
          y: Math.max(22, Math.min(H - 16, by - 13)),
          color: part.color,
          prio: (isSel || isHov) ? 10 : (part.planeId === 'char' ? 5 : 2)
        });
      }

      // Non-overlapping label placement
      labelQueue.sort((a, b) => b.prio - a.prio);
      const placed = [];
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      for(const lbl of labelQueue){
        const tw = ctx.measureText(lbl.text).width + 8;
        const th = 12;
        let ly = lbl.y;
        let overlap = true;
        for(let tries = 0; tries < 5 && overlap; tries++){
          overlap = placed.some(r => !(lbl.x + tw < r.x || lbl.x > r.x + r.w || ly + th < r.y || ly > r.y + r.h));
          if(overlap) ly += 13;
        }
        if(overlap || ly + th > H - 2) continue;
        placed.push({x: lbl.x, y: ly, w: tw, h: th});
        ctx.fillStyle = 'rgba(251, 250, 246, 0.92)';
        ctx.fillRect(lbl.x, ly, tw, th);
        ctx.strokeStyle = lbl.color;
        ctx.lineWidth = 1.1;
        ctx.strokeRect(lbl.x, ly, tw, th);
        ctx.fillStyle = '#161412';
        ctx.fillText(lbl.text, lbl.x + 4, ly + 9);
      }

      ctx.fillStyle = 'rgba(22, 20, 18, 0.86)';
      ctx.fillRect(6, 5, W - 12, 15);
      ctx.fillStyle = '#FBFAF6';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.fillText('PARTS X-RAY · Blue Vec=Cam Parallax · Amber Vec=Rig Motion · Click any part', 10, 15.5);
      return;
    }

    if(vMode === 'composite'){
      if(img){
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(img, 0, 0, W, H);
        ctx.restore();
        ctx.fillStyle = 'rgba(246, 239, 227, 0.22)';
        ctx.fillRect(0, 0, W, H);
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H*0.72);
      g.addColorStop(0, '#F4E8D1');
      g.addColorStop(1, '#FBFAF6');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#EDE0C5';
      ctx.fillRect(0, H*0.68, W, H*0.32);
    }

    const boilSeed = (fi % 3) + 1;
    const boilAmp  = 0.85;
    const planes = getActivePlanes();
    const celFill = '#FBFAF6';

    for(const plane of planes){
      if(!isPlaneVisible(plane.id)) continue;
      if(zoomPlaneId !== null && plane.id !== zoomPlaneId) continue;
      const off = camOffset(plane.z, fi);

      if(plane.id === 'char'){
        const strokes = (S && S.cast && S.cast.frames && S.cast.frames[fi])
          ? S.cast.frames[fi]
          : ((curWorm.frames && curWorm.frames[fi] && curWorm.frames[fi].doodle)
              ? curWorm.frames[fi].doodle.map(s => s.map(p => [p[0]*W, p[1]*H])) : []);
        if(strokes.length){
          drawStrokes(ctx, strokes, {color:'rgba(0,0,0,0)', width:0.1, boilSeed, boilAmp, fill:celFill});
        }
        if(vMode === 'composite'){
          drawStrokes(ctx, strokes, {color:'rgba(251,250,246,0.92)', width:5.2, boilSeed, boilAmp});
        } else if(fi === 0 && vMode === 'cartoon'){
          drawStrokes(ctx, strokes, {color:'#EF9F3A', width:6.0, boilSeed, boilAmp});
        }
        drawStrokes(ctx, strokes, {color:'#161412', width:2.5, boilSeed, boilAmp});
      } else if(S && Array.isArray(S.objects)){
        const objs = S.objects.filter(o => o.plane === plane.id);
        const depthAlpha = plane.z >= 10 ? 0.65 : (plane.z >= 6 ? 0.78 : (plane.z >= 3 ? 0.90 : 0.98));
        const depthWidth = plane.z >= 10 ? 1.6  : (plane.z >= 6 ? 1.9  : 2.2);
        for(const o of objs){
          const ost = getObjectStrokes(o, fi);
          if(!ost || !ost.length) continue;
          if(vMode === 'composite'){
            drawStrokes(ctx, ost, {
              color: 'rgba(251,250,246,0.86)',
              width: depthWidth + 2.4,
              dx: off.dx, dy: off.dy,
              boilSeed: boilSeed + 1, boilAmp: boilAmp * 0.6
            });
          }
          drawStrokes(ctx, ost, {
            color: `rgba(22,20,18,${depthAlpha})`,
            width: depthWidth,
            dx: off.dx, dy: off.dy,
            boilSeed: boilSeed + 1, boilAmp: boilAmp * 0.6,
            fill: (plane.z < 10 && o.class !== 'grass' && o.class !== 'ground') ? celFill : null
          });
        }
      } else if(curWorm && Array.isArray(curWorm.depth_worms)){
        const dwObj = curWorm.depth_worms.find(d => d.id === plane.id);
        if(dwObj && Array.isArray(dwObj.strokes0) && dwObj.strokes0.length){
          const u0 = Number.isFinite(dwObj.u0) ? dwObj.u0 : 0.5;
          const v0 = Number.isFinite(dwObj.v0) ? dwObj.v0 : 0.5;
          const mapped = dwObj.strokes0.map(s => s.map(p => [(u0 + p[0])*W + off.dx, (v0 + p[1])*H + off.dy]));
          if(vMode === 'composite'){
            drawStrokes(ctx, mapped, {color:'rgba(251,250,246,0.84)', width:4.0});
          }
          drawStrokes(ctx, mapped, {color:'#161412', width:1.8});
        }
      }
    }

    // Populate stageHitBoxes for direct stage part picking & draw active/hovered part highlight
    const allStageParts = extractShotParts(fi, zoomPlaneId);
    for(const part of allStageParts){
      if(!isPlaneVisible(part.planeId)) continue;
      if(part.kind === 'char_whole' && allStageParts.some(p => p.kind === 'char_stroke')) continue;
      const bx = part.bbox.x0 + part.off.dx, by = part.bbox.y0 + part.off.dy;
      stageHitBoxes.push({
        x: bx - 3, y: by - 3, w: Math.max(12, part.bbox.w + 6), h: Math.max(12, part.bbox.h + 6),
        partId: part.id, planeId: part.planeId
      });
    }

    const focusId = hoveredPartId || selectedPartId;
    if(focusId){
      const fp = allStageParts.find(p => p.id === focusId);
      if(fp && fp.strokes && fp.strokes.length){
        const dx = fp.off.dx, dy = fp.off.dy;
        drawStrokes(ctx, fp.strokes, {color: '#EF9F3A', width: 5.5, dx, dy});
        drawStrokes(ctx, fp.strokes, {color: fp.color, width: 2.8, dx, dy});
        ctx.save();
        ctx.strokeStyle = fp.color;
        ctx.lineWidth = 2.0;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(fp.bbox.x0 + dx - 3, fp.bbox.y0 + dy - 3, fp.bbox.w + 6, fp.bbox.h + 6);
        ctx.restore();
        const tag = `${fp.label} · z=${fp.planeZ} · k=${fp.kMult.toFixed(2)}x · [${fp.sourceTag}]`;
        ctx.font = '700 9.5px "JetBrains Mono", monospace';
        const tw = ctx.measureText(tag).width + 10;
        ctx.fillStyle = 'rgba(22, 20, 18, 0.90)';
        ctx.fillRect(6, H - 22, Math.min(W - 12, tw), 16);
        ctx.fillStyle = '#EF9F3A';
        ctx.fillText(tag, 11, H - 11);
      }
    }
  }

  function renderStage(fi){
    if(!curWorm) return;
    stageHitBoxes = [];
    const W = (S && S.W) || curWorm.W || 480;
    const H = (S && S.H) || curWorm.H || 360;
    if(cvStage.width !== W || cvStage.height !== H){
      cvStage.width = W; cvStage.height = H;
    }
    const ctx = ctxStage;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#FBFAF6';
    ctx.fillRect(0, 0, W, H);

    if(view === 'all4'){
      const qViews = [
        {id:'composite', lbl:'Composite'},
        {id:'xray',      lbl:'Parts X-Ray'},
        {id:'cartoon',   lbl:'Multiplane Cartoon'},
        {id:'footage',   lbl:'Archive Footage'}
      ];
      const hw = W * 0.5, hh = H * 0.5;
      qViews.forEach((qv, idx)=>{
        const qx = (idx % 2) * hw, qy = Math.floor(idx / 2) * hh;
        ctx.save();
        ctx.beginPath(); ctx.rect(qx, qy, hw, hh); ctx.clip();
        ctx.translate(qx, qy);
        ctx.scale(0.5, 0.5);
        renderSingleStageView(ctx, W, H, fi, qv.id);
        ctx.restore();

        ctx.strokeStyle = '#161412'; ctx.lineWidth = 1.2;
        ctx.strokeRect(qx, qy, hw, hh);
        ctx.fillStyle = 'rgba(22, 20, 18, 0.82)';
        ctx.fillRect(qx + 4, qy + 4, 108, 15);
        ctx.fillStyle = '#FBFAF6';
        ctx.font = '700 9.5px "JetBrains Mono", monospace';
        ctx.fillText(qv.lbl, qx + 8, qy + 14.5);
      });
      return;
    }

    renderSingleStageView(ctx, W, H, fi, view);
  }

  function renderPartsInspectorMode(ctx, W, H, fi, N, planes, zRef){
    const srcW = (S && S.W) || curWorm.W || 480;
    const srcH = (S && S.H) || curWorm.H || 360;
    const allParts = extractShotParts(fi, zoomPlaneId);

    // Check if selectedPartId exists in current shot; if not, reset to overview
    const activePart = selectedPartId ? allParts.find(p => p.id === selectedPartId) : null;

    if(activePart){
      // === LEVEL B: DEEP PART MICROSCOPE (Selected Part Analysis) ===
      const padL = 12, padR = 12, padT = 8, padB = 8;
      const topBarH = 22;

      // Top header bar with Back button + full part provenance
      ctx.fillStyle = '#161412';
      ctx.beginPath(); ctx.roundRect(padL, padT, W - padL - padR, topBarH, 4); ctx.fill();

      // Back button
      const backW = 92;
      ctx.fillStyle = '#EF9F3A';
      ctx.beginPath(); ctx.roundRect(padL + 3, padT + 3, backW, topBarH - 6, 3); ctx.fill();
      ctx.fillStyle = '#161412';
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.fillText('<- All Parts', padL + 9, padT + 14.5);
      pushHitBox({x: padL + 3, y: padT + 3, w: backW, h: topBarH - 6, selectPartId: '__NONE__'});

      ctx.fillStyle = '#FBFAF6';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      const hdrMeta = `${activePart.label} · Plane: ${activePart.planeLabel} (z=${activePart.planeZ}, k=${activePart.kMult.toFixed(2)}x) · Src: ${activePart.sourceFull} · ${activePart.nStrokes}S/${activePart.nPts}P`;
      ctx.fillText(hdrMeta.slice(0, 92), padL + backW + 12, padT + 14.5);

      const stripH = 44;
      const mainY = padT + topBarH + 6;
      const mainH = H - mainY - stripH - padB - 6;
      const leftW = Math.round((W - padL - padR - 8) * 0.46);
      const rightX = padL + leftW + 8;
      const rightW = W - padR - rightX;

      // Left Panel: Isolated Part Geometry + Seed Ghost + Per-Stroke/Vertex Overlay
      ctx.fillStyle = '#FFFDF8';
      ctx.strokeStyle = activePart.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.roundRect(padL, mainY, leftW, mainH, 6); ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#161412';
      ctx.font = '700 10px "Bricolage Grotesque", sans-serif';
      ctx.fillText(`ISOLATED PART GEOMETRY (f=${String(fi+1).padStart(2,'0')} vs Seed f=01)`, padL + 8, mainY + 14);

      drawPartInRect(ctx, activePart, fi, padL + 8, mainY + 20, leftW - 16, mainH - 44, {
        cropToPart: true, showGhost0: true, color: activePart.color, width: 2.6
      });

      // Vector decomposition readout bar at bottom of Left Panel
      ctx.fillStyle = 'rgba(22, 20, 18, 0.06)';
      ctx.fillRect(padL + 4, mainY + mainH - 22, leftW - 8, 18);
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.fillStyle = '#161412';
      ctx.fillText(`Total Δ:(${activePart.totalDisp.dx.toFixed(1)},${activePart.totalDisp.dy.toFixed(1)})`, padL + 8, mainY + mainH - 10);
      ctx.fillStyle = '#2B6CB0';
      ctx.fillText(`Cam k·c:(${activePart.camDisp.dx.toFixed(1)},${activePart.camDisp.dy.toFixed(1)})`, padL + 132, mainY + mainH - 10);
      ctx.fillStyle = '#D97706';
      ctx.fillText(`Rig:(${activePart.rigDisp.dx.toFixed(1)},${activePart.rigDisp.dy.toFixed(1)})`, padL + 262, mainY + mainH - 10);

      // Right Panel: Causal Motion Decomposition Graph over t = 1..N + X-Sheet Note
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#BFAF97';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(rightX, mainY, rightW, mainH, 6); ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#161412';
      ctx.font = '700 10px "Bricolage Grotesque", sans-serif';
      ctx.fillText('CAUSAL MOTION DECOMPOSITION: Total(t) = k·Cam(t) + Rig(t)', rightX + 8, mainY + 14);

      const gx0 = rightX + 34, gy0 = mainY + 24, gw = rightW - 44, gh = Math.max(40, mainH - 64);
      ctx.fillStyle = '#FBFAF6';
      ctx.strokeStyle = '#D8CCB8';
      ctx.lineWidth = 1;
      ctx.fillRect(gx0, gy0, gw, gh);
      ctx.strokeRect(gx0, gy0, gw, gh);

      // Zero baseline
      const midY = gy0 + gh * 0.5;
      ctx.strokeStyle = 'rgba(22,20,18,0.22)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(gx0, midY); ctx.lineTo(gx0 + gw, midY); ctx.stroke();
      ctx.setLineDash([]);

      // Compute time series across t = 0..N-1 for this part
      const seriesCam = [], seriesRig = [], seriesTot = [];
      let maxAbs = 12;
      for(let ti = 0; ti < N; ti++){
        const cOff = camOffset(activePart.planeZ, ti);
        let rDx = 0;
        if(activePart.kind === 'char_whole' || activePart.kind === 'char_stroke' || activePart.isAnimated){
          let stT = [];
          if(activePart.kind === 'char_whole'){
            stT = (S && S.cast && S.cast.frames && S.cast.frames[ti]) ? S.cast.frames[ti] : [];
          } else if(activePart.kind === 'char_stroke'){
            const sIdx = parseInt(activePart.id.split(':s')[1], 10) || 0;
            const fSt = (S && S.cast && S.cast.frames && S.cast.frames[ti]) ? S.cast.frames[ti] : [];
            stT = fSt[sIdx] ? [fSt[sIdx]] : [];
          } else if(S && Array.isArray(S.objects)){
            const objId = activePart.id.replace(/^obj:/, '');
            const o = S.objects.find(ob => ob.id === objId);
            if(o) stT = getObjectStrokes(o, ti);
          }
          if(stT && stT.length){
            const bbT = computeStrokesBBox(stT, srcW, srcH);
            rDx = bbT.cx - activePart.bbox0.cx;
          }
        }
        const totDx = cOff.dx + rDx;
        seriesCam.push(cOff.dx);
        seriesRig.push(rDx);
        seriesTot.push(totDx);
        maxAbs = Math.max(maxAbs, Math.abs(cOff.dx), Math.abs(rDx), Math.abs(totDx));
      }

      const plotCurve = (arr, col, width, dash)=>{
        if(arr.length < 2) return;
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = width;
        if(dash) ctx.setLineDash(dash);
        ctx.beginPath();
        for(let ti = 0; ti < arr.length; ti++){
          const x = gx0 + (ti / (arr.length - 1)) * gw;
          const y = midY - (arr[ti] / maxAbs) * (gh * 0.44);
          if(ti === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      };

      plotCurve(seriesCam, '#2B6CB0', 1.8, [4, 2]);
      plotCurve(seriesRig, '#D97706', 2.0, null);
      plotCurve(seriesTot, '#161412', 2.4, null);

      // Playhead on decomposition graph
      const phX = gx0 + (N > 1 ? (fi / (N - 1)) * gw : gw * 0.5);
      ctx.strokeStyle = '#EF9F3A';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(phX, gy0); ctx.lineTo(phX, gy0 + gh); ctx.stroke();

      // Axis labels + legend
      ctx.fillStyle = '#5E554B';
      ctx.font = '600 8.5px "JetBrains Mono", monospace';
      ctx.fillText(`+${Math.round(maxAbs)}px`, rightX + 4, gy0 + 8);
      ctx.fillText('0px', rightX + 10, midY + 3);
      ctx.fillText(`-${Math.round(maxAbs)}px`, rightX + 4, gy0 + gh - 2);

      // X-Sheet note & keyframe status for current frame fi
      const xs = (S && Array.isArray(S.xsheet) && S.xsheet[fi]) ? S.xsheet[fi] : null;
      const xsText = xs
        ? `X-Sheet f${String(fi+1).padStart(2,'0')} [${xs.kind || 'I'}]: ${xs.note || 'Inbetween frame'}`
        : `Frame f${String(fi+1).padStart(2,'0')}/${String(N).padStart(2,'0')} · Click graph to scrub`;
      ctx.fillStyle = '#161412';
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.fillText(xsText.slice(0, 62), rightX + 8, gy0 + gh + 15);

      ctx.fillStyle = '#161412'; ctx.fillText('— Total ΔX', rightX + 8, gy0 + gh + 29);
      ctx.fillStyle = '#2B6CB0'; ctx.fillText('-- k·Cam(t)', rightX + 88, gy0 + gh + 29);
      ctx.fillStyle = '#D97706'; ctx.fillText('— Rig(t)', rightX + 176, gy0 + gh + 29);

      // Bottom Strip: Sibling Parts Quick-Switcher
      const stripY = H - stripH - padB;
      const sibParts = allParts.filter(p => !(p.kind === 'char_whole' && allParts.some(q => q.kind === 'char_stroke'))).slice(0, 12);
      const nSib = Math.max(1, sibParts.length);
      const sGap = 4;
      const sW = (W - padL - padR - sGap * (nSib - 1)) / nSib;
      sibParts.forEach((sp, idx)=>{
        const sx = padL + idx * (sW + sGap);
        const isCur = (sp.id === activePart.id);
        ctx.fillStyle = isCur ? '#FFF8EB' : '#FFFFFF';
        ctx.strokeStyle = isCur ? sp.color : '#C9BBA6';
        ctx.lineWidth = isCur ? 2.2 : 1.1;
        ctx.beginPath(); ctx.roundRect(sx, stripY, sW, stripH, 4); ctx.fill(); ctx.stroke();

        drawPartInRect(ctx, sp, fi, sx + 2, stripY + 12, sW - 4, stripH - 14, {
          cropToPart: true, showGhost0: false, color: sp.color, width: 1.6
        });
        ctx.fillStyle = '#161412';
        ctx.font = '700 8px "JetBrains Mono", monospace';
        ctx.fillText(sp.shortLabel.slice(0, 9), sx + 3, stripY + 9.5);
        pushHitBox({x: sx, y: stripY, w: sW, h: stripH, selectPartId: sp.id, planeId: sp.planeId});
      });
      return;
    }

    // === LEVEL A: SMALL-MULTIPLES PART ATLAS (Overview of Decomposed Shot Parts) ===
    const padL = 10, padR = 10, padT = 6, padB = 6;
    const topBarH = 20;

    // Filter parts for overview grid so every card has generous legibility:
    // If zoomPlaneId is set, show all parts in that plane (up to 15).
    // If viewing All Planes, show char:whole + top char strokes + distinct scene objects (up to 15).
    let displayParts = [];
    if(zoomPlaneId !== null){
      displayParts = allParts.filter(p => !(p.kind === 'char_whole' && allParts.length > 1)).slice(0, 15);
    } else {
      const charWhole = allParts.find(p => p.kind === 'char_whole');
      if(charWhole) displayParts.push(charWhole);
      const sceneObjs = allParts.filter(p => p.kind === 'object' || p.kind === 'dw_fallback');
      // Prioritize distinct classes first, then fill up to 11 scene objects + 3 char strokes
      const seenClasses = new Set();
      const primaryObjs = [], secondaryObjs = [];
      for(const o of sceneObjs){
        const clsKey = `${o.planeId}:${o.shortLabel.replace(/[0-9]+$/, '')}`;
        if(!seenClasses.has(clsKey) || seenClasses.size < 6){
          seenClasses.add(clsKey);
          primaryObjs.push(o);
        } else {
          secondaryObjs.push(o);
        }
      }
      displayParts.push(...primaryObjs.slice(0, 10));
      const charStrokes = allParts.filter(p => p.kind === 'char_stroke').slice(0, Math.max(2, 15 - displayParts.length));
      displayParts.push(...charStrokes);
      if(displayParts.length < 15){
        displayParts.push(...secondaryObjs.slice(0, 15 - displayParts.length));
      }
    }

    // Top Header Bar
    ctx.fillStyle = '#EFE6D5';
    ctx.strokeStyle = '#C9BBA6';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(padL, padT, W - padL - padR, topBarH, 4); ctx.fill(); ctx.stroke();

    let hdrX = padL + 6;
    if(zoomPlaneId !== null){
      const bw = 88;
      ctx.fillStyle = '#161412';
      ctx.beginPath(); ctx.roundRect(hdrX, padT + 2, bw, topBarH - 4, 3); ctx.fill();
      ctx.fillStyle = '#EF9F3A';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.fillText('<- All Planes', hdrX + 6, padT + 13);
      pushHitBox({x: hdrX, y: padT + 2, w: bw, h: topBarH - 4, zoomPlaneOut: true});
      hdrX += bw + 8;
    }

    const xs = (S && Array.isArray(S.xsheet) && S.xsheet[fi]) ? S.xsheet[fi] : null;
    const xsInfo = xs && xs.note ? ` · X-Sheet [${xs.kind||'I'}]: ${xs.note}` : ' · Click any card for Deep Part Microscope';
    ctx.fillStyle = '#161412';
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    const titleStr = zoomPlaneId
      ? `PLANE [${zoomPlaneId.toUpperCase()}] PARTS (${displayParts.length}/${allParts.length})${xsInfo}`
      : `DECOMPOSED SHOT PARTS (${displayParts.length} shown of ${allParts.length} total)${xsInfo}`;
    ctx.fillText(titleStr.slice(0, 95), hdrX, padT + 13.5);

    const gridY = padT + topBarH + 5;
    const availW = W - padL - padR;
    const availH = H - gridY - padB;
    const nCards = Math.max(1, displayParts.length);
    const cols = nCards <= 4 ? 2 : (nCards <= 6 ? 3 : (nCards <= 8 ? 4 : 5));
    const rows = Math.ceil(nCards / cols);
    const gap = 5;
    const cw = (availW - gap * (cols - 1)) / cols;
    const ch = (availH - gap * (rows - 1)) / rows;

    displayParts.forEach((part, idx)=>{
      const c = idx % cols, r = Math.floor(idx / cols);
      const cx = padL + c * (cw + gap);
      const cy = gridY + r * (ch + gap);
      const isHov = (part.id === hoveredPartId);

      ctx.save();
      ctx.fillStyle = isHov ? '#FFFBF2' : '#FFFFFF';
      ctx.strokeStyle = isHov ? part.color : '#C9BBA6';
      ctx.lineWidth = isHov ? 2.2 : 1.2;
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 5); ctx.fill(); ctx.stroke();

      // Top mini header strip
      const topH = 14;
      ctx.fillStyle = 'rgba(22, 20, 18, 0.06)';
      ctx.fillRect(cx + 1, cy + 1, cw - 2, topH);
      ctx.fillStyle = part.color;
      ctx.fillRect(cx + 1, cy + 1, 4, topH);

      ctx.fillStyle = '#161412';
      ctx.font = '700 9px "Bricolage Grotesque", sans-serif';
      ctx.fillText(part.shortLabel.slice(0, 12), cx + 8, cy + 11);

      ctx.fillStyle = '#5E554B';
      ctx.font = '600 8px "JetBrains Mono", monospace';
      const rightTag = `z=${part.planeZ}·${part.sourceTag}`;
      const rtw = ctx.measureText(rightTag).width;
      if(cw - rtw - 4 > 54){
        ctx.fillText(rightTag, cx + cw - rtw - 4, cy + 10.5);
      }

      // Center cropped part + seed ghost
      const footH = 13;
      const bodyY = cy + topH + 2;
      const bodyH = Math.max(16, ch - topH - footH - 4);
      drawPartInRect(ctx, part, fi, cx + 3, bodyY, cw - 6, bodyH, {
        cropToPart: true, showGhost0: true, color: part.color, width: 2.0
      });

      // Bottom telemetry strip: stroke/pt count + causal shift
      const footY = cy + ch - footH;
      ctx.fillStyle = 'rgba(239, 230, 213, 0.55)';
      ctx.fillRect(cx + 1, footY, cw - 2, footH - 1);
      ctx.fillStyle = '#4A4238';
      ctx.font = '600 8px "JetBrains Mono", monospace';
      const statStr = `${part.nStrokes}S/${part.nPts}p Δ(${Math.round(part.totalDisp.dx)},${Math.round(part.totalDisp.dy)})`;
      ctx.fillText(statStr.slice(0, 22), cx + 4, footY + 9.5);
      ctx.restore();

      pushHitBox({x: cx, y: cy, w: cw, h: ch, selectPartId: part.id, planeId: part.planeId});
    });
  }

  function renderSingleWormLens(ctx, W, H, fi, N, planes, zRef, mode){
    if(mode === 'parallel'){
      renderParallelTimelinesMode(ctx, W, H, fi, N, planes, zRef);
      return;
    }
    if(mode === 'parts'){
      renderPartsInspectorMode(ctx, W, H, fi, N, planes, zRef);
      return;
    }

    if(mode === 'strobe'){
      const padT = 14, padB = 14, padL = 14, padR = 14;
      const stageW = W - padL - padR, stageH = H - padT - padB;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(padL, padT, stageW, stageH, 6);
      ctx.clip();

      const bgImg = getFrameImg(curWorm, fi) || getFrameImg(curWorm, 0);
      if(bgImg){
        ctx.globalAlpha = 0.26;
        ctx.drawImage(bgImg, padL, padT, stageW, stageH);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(251, 250, 246, 0.45)';
      ctx.fillRect(padL, padT, stageW, stageH);

      // Draw all visible non-character depth planes so background/foreground parts are visible on the trail stage
      for(const plane of planes){
        if(plane.id !== 'char' && isPlaneVisible(plane.id)){
          drawPlaneObjectsInRect(ctx, plane, fi, padL, padT, stageW, stageH, false);
        }
      }

      const nGhosts = Math.min(N, 7);
      for(let g=0; g<nGhosts; g++){
        const ti = nGhosts===1 ? 0 : Math.round((g/(nGhosts-1))*(N-1));
        if(ti === fi) continue;
        const isFirst = (ti === 0), isLast = (ti === N-1);
        drawSamCutoutInRect(ctx, curWorm, ti, padL, padT, stageW, stageH, {
          cropToMask: false,
          drawOutline: true,
          outlineColor: isFirst ? '#2E7A4A' : (isLast ? '#B8432F' : '#8A6114'),
          drawDoodle: true,
          doodleColor: isFirst ? '#2E7A4A' : (isLast ? '#B8432F' : 'rgba(22,20,18,0.55)'),
          alpha: (isFirst || isLast) ? 0.58 : 0.30
        });
      }

      const frames = curWorm.frames || [];
      if(frames.length >= 2){
        ctx.beginPath();
        frames.forEach((fr, ti)=>{
          const c = fr.c || [0.5, 0.5];
          const x = padL + c[0]*stageW, y = padT + c[1]*stageH;
          if(ti===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.strokeStyle = '#EF9F3A';
        ctx.lineWidth = 3.2;
        ctx.stroke();
      }

      drawSamCutoutInRect(ctx, curWorm, fi, padL, padT, stageW, stageH, {
        cropToMask: false, drawOutline: true, outlineColor: '#EF9F3A', drawDoodle: true, doodleColor: '#161412', alpha: 1.0
      });
      ctx.restore();
      ctx.strokeStyle = '#161412'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(padL, padT, stageW, stageH, 6); ctx.stroke();
      return;
    }

    if(mode === 'kymo'){
      const padL = 124, padR = 14, padT = 14, padB = 14;
      const trackW = W - padL - padR;
      const availH = H - padT - padB;
      const gap = 8;
      const bandH = (availH - gap*2) / 3;
      const frames = curWorm.frames || [];

      const bands = [
        {title:'Horizontal X(t)', sub:'Left to Right', color:'#EF9F3A', getVal: fr => (fr.c ? fr.c[0] : 0.5), stamps:true},
        {title:'Vertical Y(t)', sub:'Top to Bottom', color:'#2E7A4A', getVal: fr => (fr.c ? fr.c[1] : 0.5), stamps:false},
        {title:'Scale R(t)', sub:'Size & Cam Pan', color:'#2B6CB0', getVal: fr => Math.min(1, (fr.r || 0.15)*2.5), stamps:false}
      ];

      bands.forEach((b, bIdx)=>{
        const y0 = padT + bIdx*(bandH + gap);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#BFAF97';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(10, y0, W-20, bandH, 5); ctx.fill(); ctx.stroke();

        ctx.save();
        ctx.beginPath(); ctx.rect(11, y0+1, padL-16, bandH-2); ctx.clip();
        ctx.fillStyle = 'rgba(239, 159, 58, 0.14)';
        ctx.fillRect(11, y0+1, padL-16, bandH-2);
        ctx.fillStyle = '#161412';
        ctx.font = '700 11px "Bricolage Grotesque", sans-serif';
        ctx.fillText(b.title, 16, y0 + bandH*0.42);
        ctx.fillStyle = '#5E554B';
        ctx.font = '500 9.5px "JetBrains Mono", monospace';
        ctx.fillText(b.sub, 16, y0 + bandH*0.72);
        ctx.restore();

        ctx.save();
        ctx.beginPath(); ctx.rect(padL, y0+2, trackW, bandH-4); ctx.clip();

        if(b.stamps){
          const nSt = Math.min(N, 6);
          const cw = Math.round((bandH-10)*1.18), ch = Math.round(bandH-10);
          for(let s=0; s<nSt; s++){
            const ti = nSt===1 ? 0 : Math.round((s/(nSt-1))*(N-1));
            const cx = padL + (N>1 ? (ti/(N-1))*trackW : trackW*0.5);
            const rx = Math.max(padL+2, Math.min(padL+trackW-cw-2, cx - cw*0.5));
            ctx.globalAlpha = 0.55;
            drawSamCutoutInRect(ctx, curWorm, ti, rx, y0+5, cw, ch, {cropToMask:true, drawOutline:false, drawDoodle:true});
            pushHitBox({x: rx, y: y0+5, w: cw, h: ch, fi: ti, planeId: null, togglePlane: false});
          }
          ctx.globalAlpha = 1;
        }

        if(frames.length >= 2){
          ctx.beginPath();
          frames.forEach((fr, ti)=>{
            const x = padL + (N>1 ? (ti/(N-1))*trackW : trackW*0.5);
            const v = Math.max(0, Math.min(1, b.getVal(fr)));
            const y = y0 + 10 + v*(bandH - 20);
            if(ti===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
          });
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 2.6;
          ctx.stroke();
        }
        ctx.restore();
      });

      const scrubX = padL + (N>1 ? (fi/(N-1))*trackW : trackW*0.5);
      ctx.save();
      ctx.strokeStyle = '#EF9F3A'; ctx.lineWidth = 2.2;
      ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(scrubX, padT-4); ctx.lineTo(scrubX, H-padB+4); ctx.stroke();
      ctx.restore();
      return;
    }

    if(mode === 'anatomy'){
      const padL = 14, padR = 14, padT = 14, padB = 14;
      const topH = Math.round((H - padT - padB) * 0.50);
      const botY = padT + topH + 10;
      const botH = H - padB - botY;
      const halfW = Math.round((W - padL - padR - 10) * 0.5);

      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#BFAF97'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(padL, padT, halfW, topH, 6); ctx.fill(); ctx.stroke();
      drawSamCutoutInRect(ctx, curWorm, 0, padL+8, padT+22, halfW-16, topH-28, {
        cropToMask: true, drawOutline: true, outlineColor: '#BFAF97', drawDoodle: true, doodleColor: '#EF9F3A'
      });
      ctx.fillStyle = '#8A4A05'; ctx.font = '700 10.5px "JetBrains Mono", monospace';
      ctx.fillText('THE LINE (f=01 Seed Doodle)', padL+10, padT+15);
      pushHitBox({x: padL, y: padT, w: halfW, h: topH, fi: 0, planeId: null, togglePlane: false});

      const rx0 = padL + halfW + 10;
      ctx.fillStyle = '#FFFDF8'; ctx.strokeStyle = '#EF9F3A'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.roundRect(rx0, padT, halfW, topH, 6); ctx.fill(); ctx.stroke();
      drawSamCutoutInRect(ctx, curWorm, fi, rx0+8, padT+22, halfW-16, topH-28, {
        cropToMask: true, drawOutline: true, outlineColor: '#EF9F3A', drawDoodle: true, doodleColor: '#161412'
      });
      ctx.fillStyle = '#161412'; ctx.font = '700 10.5px "JetBrains Mono", monospace';
      ctx.fillText(`WARPED RIG @ f=${String(fi+1).padStart(2,'0')}/${String(N).padStart(2,'0')}`, rx0+10, padT+15);

      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#BFAF97'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(padL, botY, W - padL - padR, botH, 6); ctx.fill(); ctx.stroke();

      const jPadL = padL + 118, jTrackW = W - padR - jPadL - 10;
      const joints = curWorm.joints || {};
      const jNames = Object.keys(joints);
      const colors = ['#EF9F3A','#2E7A4A','#2B6CB0','#B8432F','#6B46C1','#8A6114'];
      const rows = jNames.length
        ? jNames.slice(0, 5).map((jn, i)=>({label: jn.replace(/_/g,' '), pts: joints[jn], color: colors[i%colors.length]}))
        : (curWorm.depth_worms || []).slice(0, 5).map((dw, i)=>({label: dw.label, pts: (dw.track||[]).map(t=>[t[0],t[1]]), color: dw.color || colors[i%colors.length]}));

      const rTop = botY + 8, rAvail = botH - 14;
      const rH = Math.max(16, rAvail / Math.max(1, rows.length));
      rows.forEach((r, idx)=>{
        const ry = rTop + idx * rH;
        ctx.save();
        ctx.beginPath(); ctx.rect(padL + 6, ry, jPadL - padL - 10, rH); ctx.clip();
        ctx.fillStyle = '#5E554B'; ctx.font = '600 9.5px "JetBrains Mono", monospace';
        ctx.fillText(String(r.label).slice(0, 14), padL+10, ry + rH*0.68);
        ctx.restore();

        const pts = r.pts || [];
        if(pts.length >= 2){
          ctx.beginPath();
          pts.forEach((uv, ti)=>{
            const x = jPadL + (N>1 ? (ti/(N-1))*jTrackW : jTrackW*0.5);
            const y = ry + 3 + Math.max(0, Math.min(1, uv[1]))*(rH - 6);
            if(ti===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
          });
          ctx.strokeStyle = r.color; ctx.lineWidth = 2; ctx.stroke();
        }
      });

      const scrubX = jPadL + (N>1 ? (fi/(N-1))*jTrackW : jTrackW*0.5);
      ctx.save();
      ctx.strokeStyle = '#EF9F3A'; ctx.lineWidth = 2; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(scrubX, rTop-2); ctx.lineTo(scrubX, botY+botH-4); ctx.stroke();
      ctx.restore();
      return;
    }

    if(mode === 'box'){
      const padX = 24, padT = 18, padB = 18;
      const availW = W - padX*2, availH = H - padT - padB;
      const nP = planes.length;
      const srcW = (S && S.W) || curWorm.W || 480;
      const srcH = (S && S.H) || curWorm.H || 360;

      planes.forEach((plane, idx)=>{
        const vis = isPlaneVisible(plane.id);
        const u = nP === 1 ? 0.5 : idx / (nP - 1);
        const scale = 0.54 + u * 0.34;
        const pw = availW * scale, ph = availH * scale;
        const cx = padX + (1 - u) * (availW - pw) * 0.85 + u * (availW - pw) * 0.12;
        const cy = padT + (1 - u) * 6 + u * (availH - ph) * 0.85;
        const off = camOffset(plane.z, fi);
        const sx = pw / srcW, sy = ph / srcH;
        const t = tintForPlane(plane.id, plane.z, zRef);

        ctx.save();
        ctx.globalAlpha = vis ? 1.0 : 0.22;
        ctx.fillStyle = t.fill;
        ctx.strokeStyle = t.stroke;
        ctx.lineWidth = (plane.id === 'char') ? 2.4 : 1.4;
        ctx.beginPath();
        ctx.roundRect(cx, cy, pw, ph, 4);
        ctx.fill(); ctx.stroke();

        ctx.save();
        ctx.beginPath(); ctx.rect(cx, cy, pw, ph); ctx.clip();
        if(plane.id === 'char'){
          drawSamCutoutInRect(ctx, curWorm, fi, cx, cy, pw, ph, {
            cropToMask: false, drawOutline: true, outlineColor: '#EF9F3A', drawDoodle: true
          });
        } else {
          drawPlaneObjectsInRect(ctx, plane, fi, cx, cy, pw, ph, false);
        }
        ctx.restore();

        const lblText = `${plane.label} · z=${plane.z}`;
        ctx.font = '600 9.5px "JetBrains Mono", monospace';
        const tw = ctx.measureText(lblText).width + 8;
        const lx = cx + 6 + (idx % 2) * Math.min(110, pw * 0.35);
        const ly = cy + 4;
        ctx.fillStyle = 'rgba(251, 250, 246, 0.92)';
        ctx.fillRect(lx, ly, tw, 13);
        ctx.fillStyle = '#161412';
        ctx.fillText(lblText, lx + 4, ly + 10);
        ctx.restore();

        pushHitBox({x: cx, y: cy, w: pw, h: ph, fi, planeId: plane.id, togglePlane: true});
      });
      return;
    }

    // LENS 2: DISENTANGLED PLANE WORMS ('lanes') — supports Semantic Zoom into Plane Parts!
    if(zoomPlaneId !== null){
      const planeParts = extractShotParts(fi, zoomPlaneId).filter(p => !(p.kind === 'char_whole' && zoomPlaneId === 'char')).slice(0, 7);
      const padL = 132, padR = 14, padT = 26, padB = 10;
      const availH = H - padT - padB;
      const nP = Math.max(1, planeParts.length);
      const laneGap = 5;
      const laneH = Math.max(28, (availH - laneGap * (nP - 1)) / nP);
      const trackW = W - padL - padR;

      // Top breadcrumb bar
      ctx.fillStyle = '#161412';
      ctx.beginPath(); ctx.roundRect(10, 4, 96, 18, 3); ctx.fill();
      ctx.fillStyle = '#EF9F3A';
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.fillText('<- All Planes', 16, 16);
      pushHitBox({x: 10, y: 4, w: 96, h: 18, zoomPlaneOut: true});

      ctx.fillStyle = '#161412';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.fillText(`PLANE [${zoomPlaneId.toUpperCase()}] PART LANES (${planeParts.length} parts) · Click part header to inspect`, 114, 16.5);

      for(let pIdx = 0; pIdx < planeParts.length; pIdx++){
        const part = planeParts[pIdx];
        const y0 = padT + pIdx * (laneH + laneGap);
        const isSel = (part.id === selectedPartId || part.id === hoveredPartId);

        ctx.save();
        ctx.fillStyle = isSel ? '#FFFBF2' : '#FFFFFF';
        ctx.strokeStyle = isSel ? part.color : '#BFAF97';
        ctx.lineWidth = isSel ? 2.0 : 1.2;
        ctx.beginPath(); ctx.roundRect(10, y0, W - 20, laneH, 5); ctx.fill(); ctx.stroke();

        ctx.save();
        ctx.beginPath(); ctx.rect(11, y0 + 1, padL - 16, laneH - 2); ctx.clip();
        ctx.fillStyle = 'rgba(239, 230, 213, 0.55)';
        ctx.fillRect(11, y0 + 1, padL - 16, laneH - 2);
        ctx.fillStyle = part.color;
        ctx.fillRect(11, y0 + 1, 4, laneH - 2);
        ctx.fillStyle = '#161412';
        ctx.font = '700 10px "Bricolage Grotesque", sans-serif';
        ctx.fillText(part.shortLabel.slice(0, 14), 19, y0 + Math.min(15, laneH * 0.44));
        ctx.fillStyle = '#5E554B';
        ctx.font = '500 8.5px "JetBrains Mono", monospace';
        ctx.fillText(`${part.sourceTag} · ${part.nStrokes}S/${part.nPts}p`, 19, y0 + Math.min(28, laneH * 0.80));
        ctx.restore();
        pushHitBox({x: 11, y: y0 + 1, w: padL - 16, h: laneH - 2, selectPartId: part.id, setMode: 'parts'});

        ctx.save();
        ctx.beginPath(); ctx.rect(padL, y0 + 2, trackW, laneH - 4); ctx.clip();

        const nStamps = Math.min(N, 6);
        const celH = Math.max(20, laneH - 8);
        const celW = Math.round(celH * 1.18);
        let lastRight = -999;
        for(let sIdx = 0; sIdx < nStamps; sIdx++){
          const ti = nStamps === 1 ? 0 : Math.round((sIdx / (nStamps - 1)) * (N - 1));
          const cx = padL + (N > 1 ? (ti / (N - 1)) * trackW : trackW * 0.5);
          const rx = Math.max(padL + 2, Math.min(padL + trackW - celW - 2, cx - celW * 0.5));
          if(rx < lastRight + 4) continue;
          lastRight = rx + celW;
          const ry = y0 + (laneH - celH) * 0.5;
          ctx.fillStyle = '#FBFAF6';
          ctx.strokeStyle = '#C9BBA6';
          ctx.lineWidth = 1.0;
          ctx.fillRect(rx, ry, celW, celH);
          drawPartInRect(ctx, part, ti, rx + 2, ry + 2, celW - 4, celH - 4, {
            cropToPart: true, showGhost0: false, color: part.color, width: 1.7
          });
          ctx.strokeRect(rx, ry, celW, celH);
          pushHitBox({x: rx, y: ry, w: celW, h: celH, fi: ti});
        }

        const actX = padL + (N > 1 ? (fi / (N - 1)) * trackW : trackW * 0.5);
        const actH = Math.max(22, laneH - 4);
        const actW = Math.round(actH * 1.24);
        const arx = Math.max(padL + 2, Math.min(padL + trackW - actW - 2, actX - actW * 0.5));
        const ary = y0 + (laneH - actH) * 0.5;
        ctx.fillStyle = '#FFFBF4';
        ctx.strokeStyle = part.color;
        ctx.lineWidth = 2.0;
        ctx.fillRect(arx, ary, actW, actH);
        drawPartInRect(ctx, part, fi, arx + 2, ary + 2, actW - 4, actH - 4, {
          cropToPart: true, showGhost0: true, color: part.color, width: 2.1
        });
        ctx.strokeRect(arx, ary, actW, actH);
        ctx.restore();
        ctx.restore();
      }

      const scrubX = padL + (N > 1 ? (fi / (N - 1)) * trackW : trackW * 0.5);
      ctx.save();
      ctx.strokeStyle = '#EF9F3A'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(scrubX, padT - 4); ctx.lineTo(scrubX, H - padB + 4); ctx.stroke();
      ctx.restore();
      return;
    }

    const planesNearFirst = planes.slice().reverse();
    const padL = 124, padR = 14, padT = 14, padB = 14;
    const availH = H - padT - padB;
    const nP = Math.max(1, planesNearFirst.length);
    const laneGap = 6;
    const laneH = Math.max(36, (availH - laneGap*(nP-1)) / nP);
    const trackW = W - padL - padR;

    for(let pIdx=0; pIdx<planesNearFirst.length; pIdx++){
      const plane = planesNearFirst[pIdx];
      const vis = isPlaneVisible(plane.id);
      const y0 = padT + pIdx*(laneH + laneGap);
      const t = tintForPlane(plane.id, plane.z, zRef);
      const isChar = (plane.id === 'char');

      ctx.save();
      ctx.globalAlpha = vis ? 1.0 : 0.32;
      ctx.fillStyle = isChar ? '#FFFDF8' : '#FFFFFF';
      ctx.strokeStyle = isChar ? '#EF9F3A' : '#BFAF97';
      ctx.lineWidth = isChar ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.roundRect(10, y0, W - 20, laneH, 6);
      ctx.fill(); ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.rect(11, y0 + 1, padL - 16, laneH - 2);
      ctx.clip();
      ctx.fillStyle = t.fill;
      ctx.fillRect(11, y0 + 1, padL - 16, laneH - 2);
      ctx.fillStyle = '#161412';
      ctx.font = '700 11px "Bricolage Grotesque", sans-serif';
      const shortName = String(plane.label || plane.id).split('(')[0].trim().slice(0, 15);
      ctx.fillText(shortName, 16, y0 + Math.min(16, laneH*0.36));
      ctx.fillStyle = '#5E554B';
      ctx.font = '500 9px "JetBrains Mono", monospace';
      const kMult = ((zRef / Math.max(0.2, plane.z)) * kScale).toFixed(2);
      ctx.fillText(`z=${plane.z} · k=${kMult}x`, 16, y0 + Math.min(29, laneH*0.64));

      // Semantic Zoom affordance: [+ Parts] drill-down badge inside plane header
      if(laneH >= 38){
        const bx = 15, by = y0 + laneH - 15, bw = 54, bh = 12;
        ctx.fillStyle = 'rgba(22, 20, 18, 0.82)';
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 2.5); ctx.fill();
        ctx.fillStyle = '#EF9F3A';
        ctx.font = '700 8px "JetBrains Mono", monospace';
        ctx.fillText('+ Parts', bx + 6, by + 9);
        pushHitBox({x: bx, y: by, w: bw, h: bh, zoomPlaneIn: plane.id});
      }
      ctx.restore();
      pushHitBox({x: 11, y: y0 + 1, w: padL - 16, h: Math.max(18, laneH - 17), fi, planeId: plane.id, togglePlane: true});

      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, y0 + 2, trackW, laneH - 4);
      ctx.clip();

      // Continuous motion trajectory ribbon along the lane
      if(N >= 2){
        ctx.save();
        ctx.beginPath();
        const srcW = (S && S.W) || curWorm.W || 480;
        for(let ti = 0; ti < N; ti++){
          const x = padL + (ti / (N - 1)) * trackW;
          let uVal = 0.5;
          if(isChar && curWorm.frames && curWorm.frames[ti] && curWorm.frames[ti].c){
            uVal = curWorm.frames[ti].c[0];
          } else {
            const offT = camOffset(plane.z, ti);
            uVal = 0.5 + (offT.dx / Math.max(120, srcW * 0.75));
          }
          const y = y0 + 6 + Math.max(0.08, Math.min(0.92, uVal)) * (laneH - 12);
          if(ti === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = isChar ? 'rgba(239, 159, 58, 0.55)' : t.stroke;
        ctx.lineWidth = 2.0;
        ctx.stroke();
        ctx.restore();
      }

      const actX = padL + (N > 1 ? (fi / (N - 1)) * trackW : trackW * 0.5);
      const actH = Math.max(26, laneH - 6);
      const actW = Math.round(actH * 1.28);

      const nStamps = Math.min(N, 6);
      const celH = Math.max(22, laneH - 10);
      const celW = Math.round(celH * 1.20);
      let lastStampRight = -999;

      for(let sIdx=0; sIdx<nStamps; sIdx++){
        const ti = nStamps === 1 ? 0 : Math.round((sIdx / (nStamps - 1)) * (N - 1));
        const cx = padL + (N > 1 ? (ti / (N - 1)) * trackW : trackW * 0.5);
        const rx = Math.max(padL + 2, Math.min(padL + trackW - celW - 2, cx - celW * 0.5));
        if(rx < lastStampRight + 4) continue;
        lastStampRight = rx + celW;
        const ry = y0 + (laneH - celH) * 0.5;

        ctx.save();
        ctx.globalAlpha = vis ? 0.94 : 0.30;
        ctx.fillStyle = '#FBFAF6';
        ctx.strokeStyle = '#C9BBA6';
        ctx.lineWidth = 1.1;
        ctx.fillRect(rx, ry, celW, celH);
        if(isChar){
          drawSamCutoutInRect(ctx, curWorm, ti, rx+1, ry+1, celW-2, celH-2, {
            cropToMask: true, drawOutline: false, drawDoodle: true
          });
        } else {
          drawPlaneObjectsInRect(ctx, plane, ti, rx+1, ry+1, celW-2, celH-2, true);
        }
        ctx.strokeRect(rx, ry, celW, celH);
        ctx.restore();
        pushHitBox({x: rx, y: ry, w: celW, h: celH, fi: ti, planeId: null, togglePlane: false});
      }

      const arx = Math.max(padL + 2, Math.min(padL + trackW - actW - 2, actX - actW * 0.5));
      const ary = y0 + (laneH - actH) * 0.5;
      ctx.fillStyle = '#FFFBF4';
      ctx.strokeStyle = '#EF9F3A';
      ctx.lineWidth = 2.0;
      ctx.fillRect(arx, ary, actW, actH);
      if(isChar){
        drawSamCutoutInRect(ctx, curWorm, fi, arx+1, ary+1, actW-2, actH-2, {
          cropToMask: true, drawOutline: true, outlineColor: '#EF9F3A', drawDoodle: true
        });
      } else {
        drawPlaneObjectsInRect(ctx, plane, fi, arx+1, ary+1, actW-2, actH-2, true);
      }
      ctx.strokeRect(arx, ary, actW, actH);

      ctx.restore();
      ctx.restore();
    }

    const scrubX = padL + (N > 1 ? (fi / (N - 1)) * trackW : trackW * 0.5);
    ctx.save();
    ctx.strokeStyle = '#EF9F3A';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(scrubX, padT - 4);
    ctx.lineTo(scrubX, H - padB + 4);
    ctx.stroke();
    ctx.restore();
  }

  function renderAll109WormsWall(ctx, W, H, fi, N){
    ctx.fillStyle = '#0D0C0A';
    ctx.fillRect(0, 0, W, H);
    const total = WORMS.length || 1;
    const cols = 11;
    const rows = Math.ceil(total / cols);
    const pad = 6, gap = 3;
    const cw = (W - pad*2 - gap*(cols - 1)) / cols;
    const ch = (H - pad*2 - gap*(rows - 1)) / rows;
    const uNorm = N > 1 ? fi / (N - 1) : 0;

    WORMS.forEach((w, idx)=>{
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const cx = pad + c * (cw + gap);
      const cy = pad + r * (ch + gap);
      const isCur = (idx === curIdx);

      ctx.save();
      ctx.fillStyle = isCur ? '#2B2214' : '#161411';
      ctx.strokeStyle = isCur ? '#EF9F3A' : '#332E27';
      ctx.lineWidth = isCur ? 2.0 : 1.0;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, 3);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.rect(cx + 1, cy + 1, cw - 2, ch - 2);
      ctx.clip();

      const dws = w.depth_worms || [];
      for(let i = dws.length - 1; i >= 0; i--){
        const dw = dws[i];
        const tr = dw.track || [];
        if(!tr.length) continue;
        ctx.beginPath();
        for(let ti = 0; ti < tr.length; ti++){
          const tx = cx + 4 + (tr.length > 1 ? (ti / (tr.length - 1)) * (cw - 8) : (cw - 8) * 0.5);
          const ty = cy + 12 + Math.max(0.05, Math.min(0.95, tr[ti][1])) * (ch - 15);
          if(ti === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
        }
        ctx.strokeStyle = dw.role === 'subject' ? '#EF9F3A' : (dw.color || '#6E98D6');
        ctx.lineWidth = dw.role === 'subject' ? 1.7 : 0.9;
        ctx.globalAlpha = dw.role === 'subject' ? 0.95 : 0.45;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const wfCount = (w.frames && w.frames.length) || w.n_frames || 1;
      const wFi = Math.min(wfCount - 1, Math.max(0, Math.round(uNorm * (wfCount - 1))));
      const playX = cx + 4 + uNorm * (cw - 8);
      ctx.strokeStyle = isCur ? '#FFFFFF' : 'rgba(239, 159, 58, 0.72)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(playX, cy + 11);
      ctx.lineTo(playX, cy + ch - 2);
      ctx.stroke();

      const fr = w.frames && w.frames[wFi];
      if(fr && fr.doodle){
        ctx.strokeStyle = '#FFFDF8';
        ctx.lineWidth = 0.95;
        const dBox = Math.min(cw * 0.36, ch - 13);
        const dx0 = Math.max(cx + 2, Math.min(cx + cw - dBox - 2, playX - dBox * 0.5));
        const dy0 = cy + 11 + (ch - 12 - dBox) * 0.5;
        for(const s of fr.doodle){
          if(!s || s.length < 2) continue;
          ctx.beginPath();
          for(let k = 0; k < s.length; k++){
            const px = dx0 + s[k][0] * dBox;
            const py = dy0 + s[k][1] * dBox;
            if(k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }

      ctx.fillStyle = isCur ? '#EF9F3A' : '#CFC6B8';
      ctx.font = '700 8px "JetBrains Mono", monospace';
      const lbl = `${(w.lot || '').replace('SM-','')} ${(w.title || w.slug || '').slice(0, 8)}`.trim();
      ctx.fillText(lbl, cx + 3, cy + 9);
      ctx.restore();

      pushHitBox({x: cx, y: cy, w: cw, h: ch, selectShotIdx: idx});
    });
  }

  function areAllPlanesOn(planes){
    if(soloPlaneId !== null) return false;
    return planes.every(p => planeOn[p.id] !== false);
  }

  function renderWorm(fi){
    if(!curWorm) return;
    wormHitBoxes = [];
    hitTransform = {tx: 0, ty: 0, sx: 1, sy: 1};
    const W = cvWorm.width, H = cvWorm.height;
    const ctx = ctxWorm;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#FBFAF6';
    ctx.fillRect(0, 0, W, H);

    const N = (S && S.cast && S.cast.frames) ? S.cast.frames.length : (curWorm.n_frames || 1);
    const planes = getActivePlanes();
    const zRef = (S && S.z_ref) || curWorm.z_ref || 2;
    const visCount = planes.filter(p => isPlaneVisible(p.id)).length;
    const planeText = zoomPlaneId
      ? `Plane: ${zoomPlaneId}`
      : ((visCount === planes.length) ? `All ${planes.length} planes` : `${visCount}/${planes.length} planes`);
    if(document.getElementById('wormStatePill')) document.getElementById('wormStatePill').textContent = `${planeText} · f ${String(fi+1).padStart(2,'0')}/${String(N).padStart(2,'0')}`;

    if(wormMode === 'wall'){
      renderAll109WormsWall(ctx, W, H, fi, N);
      return;
    }

    if(wormMode === 'all'){
      const lenses = [
        {id:'parallel', lbl:'1 · 3D Butter'},
        {id:'lanes',    lbl:'2 · Planes'},
        {id:'parts',    lbl:'3 · Parts'},
        {id:'strobe',   lbl:'4 · Trail'},
        {id:'kymo',     lbl:'5 · Graphs'},
        {id:'anatomy',  lbl:'6 · Rig'}
      ];
      const cols = 3, rows = 2;
      const pad = 6, gap = 6;
      const pw = (W - pad*2 - gap*(cols - 1)) / cols;
      const ph = (H - pad*2 - gap*(rows - 1)) / rows;
      lenses.forEach((m, idx)=>{
        const c = idx % cols, r = Math.floor(idx / cols);
        const px = pad + c * (pw + gap);
        const py = pad + r * (ph + gap);
        const sx = pw / W, sy = ph / H;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 6);
        ctx.clip();
        ctx.fillStyle = '#FBFAF6';
        ctx.fillRect(px, py, pw, ph);
        ctx.translate(px, py);
        ctx.scale(sx, sy);
        hitTransform = {tx: px, ty: py, sx, sy};
        renderSingleWormLens(ctx, W, H, fi, N, planes, zRef, m.id);
        ctx.restore();

        hitTransform = {tx: 0, ty: 0, sx: 1, sy: 1};
        ctx.strokeStyle = '#161412';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 6);
        ctx.stroke();

        // Clickable lens header badge to expand any of the 6 lenses
        const bx = px + 6, by = py + 5, bw = 96, bh = 16;
        ctx.fillStyle = 'rgba(22, 20, 18, 0.86)';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 3);
        ctx.fill();
        ctx.fillStyle = '#EF9F3A';
        ctx.font = '700 9.5px "JetBrains Mono", monospace';
        ctx.fillText(m.lbl, bx + 6, by + 11.5);
        pushHitBox({x: bx, y: by, w: bw, h: bh, setMode: m.id});
      });
      return;
    }

    renderSingleWormLens(ctx, W, H, fi, N, planes, zRef, wormMode);
  }


  function syncConditionalRecoveryUI(){
    const planes = getActivePlanes();
    const allPlanesActive = areAllPlanesOn(planes);
    if(restorePlanesBtn){
      restorePlanesBtn.style.display = allPlanesActive ? 'none' : '';
    }
    if(zoomCrumbBtn){
      const hasZoom = (zoomPlaneId !== null || selectedPartId !== null);
      zoomCrumbBtn.style.display = hasZoom ? '' : 'none';
      if(selectedPartId !== null){
        zoomCrumbBtn.textContent = zoomPlaneId ? `<- Plane [${zoomPlaneId}]` : '<- All Parts';
      } else if(zoomPlaneId !== null){
        zoomCrumbBtn.textContent = '<- All Planes';
      }
    }
  }

  function togglePlaneVisibility(pid){
    const planes = getActivePlanes();
    soloPlaneId = null;
    planeOn[pid] = (planeOn[pid] === false) ? true : false;
    const anyVisible = planes.some(p => planeOn[p.id] !== false);
    if(!anyVisible){
      planeOn = {};
    }
  }

  function buildPlanesUI(){
    if(!planesRow) return;
    planesRow.innerHTML = '';
    const planes = getActivePlanes();
    const allActive = areAllPlanesOn(planes) && zoomPlaneId === null;

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'plane-pill';
    allBtn.setAttribute('aria-pressed', allActive ? 'true' : 'false');
    allBtn.textContent = `All (${planes.length})`;
    allBtn.addEventListener('click', ()=>{
      soloPlaneId = null;
      zoomPlaneId = null;
      selectedPartId = null;
      planeOn = {};
      buildPlanesUI();
      syncPlanesToIcaroDots();
      renderAll();
    });
    planesRow.appendChild(allBtn);

    planes.slice().reverse().forEach(p=>{
      const vis = isPlaneVisible(p.id);
      const isZoomed = (zoomPlaneId === p.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'plane-pill' + (p.id === 'char' ? ' subj' : '');
      btn.setAttribute('aria-pressed', vis ? 'true' : 'false');
      btn.title = 'Click to toggle plane visibility · Double-click (or Shift-click) to zoom into this plane’s constituent parts';
      const shortLbl = String(p.label || p.id).split('(')[0].trim().slice(0, 14);
      btn.textContent = `${isZoomed ? '[*] ' : ''}${shortLbl} z=${p.z}`;
      btn.addEventListener('click', (e)=>{
        if(e.shiftKey || wormMode === 'parts'){
          zoomPlaneId = (zoomPlaneId === p.id) ? null : p.id;
          selectedPartId = null;
          planeOn[p.id] = true;
          buildPlanesUI();
          syncPlanesToIcaroDots();
          renderAll();
          return;
        }
        togglePlaneVisibility(p.id);
        buildPlanesUI();
        syncPlanesToIcaroDots();
        renderAll();
      });
      btn.addEventListener('dblclick', ()=>{
        zoomPlaneId = (zoomPlaneId === p.id) ? null : p.id;
        selectedPartId = null;
        planeOn[p.id] = true;
        buildPlanesUI();
        syncPlanesToIcaroDots();
        renderAll();
      });
      planesRow.appendChild(btn);
    });
  }

  function hydrateShotData(data){
    if(!data) return null;
    if(!data.W && data.canvas){
      data.W = data.canvas.width || 480;
      data.H = data.canvas.height || 360;
      data.fps = data.canvas.fps || 24;
    }
    if(Array.isArray(data.footage) && !data._imgs){
      data._imgs = data.footage.map(src=>{
        if(typeof src === 'string' && src.startsWith('data:')){
          const im = new Image();
          im.onload = () => { if(S === data) renderAll(); };
          im.src = src;
          return im;
        }
        return null;
      });
    }
    return data;
  }

  // Stamp active planes into ICARO's 128x96 state.frames so DOT MATRIX view & timeline thumbnails stay 100% in sync!
  const _off128 = document.createElement('canvas');
  _off128.width = 128; _off128.height = 96;
  const _off128Ctx = _off128.getContext('2d', { willReadFrequently: true });

  function syncPlanesToIcaroDots(){
    if(!curWorm || typeof window.icaroStampDoodleFrames !== 'function') return;
    const N = (S && S.cast && S.cast.frames) ? S.cast.frames.length : (curWorm.n_frames || 1);
    const W_src = (S && S.W) || curWorm.W || 480;
    const H_src = (S && S.H) || curWorm.H || 360;
    const sx = 128 / W_src, sy = 96 / H_src;
    const planes = getActivePlanes();
    const visPlanes = planes.filter(p => isPlaneVisible(p.id) && (zoomPlaneId === null || p.id === zoomPlaneId));
    const drawList = visPlanes.length ? visPlanes : planes;

    function inkForPlane(plane){
      if(drawList.length === 1) return 7;
      if(plane.id === 'char') return 7;
      if(plane.z <= 1.5) return 6;
      if(plane.z <= 2.8) return 5;
      if(plane.z <= 4.0) return 4;
      if(plane.z <= 7.0) return 3;
      return 2;
    }

    const gridsByFrame = [];
    for(let ti = 0; ti < N; ti++){
      const gridLevels = new Uint8Array(128 * 96);
      for(const plane of drawList){
        const off = camOffset(plane.z, ti);
        let stList = [];
        if(plane.id === 'char'){
          if(S && S.cast && S.cast.frames && S.cast.frames[ti]) stList = S.cast.frames[ti];
          else if(curWorm.frames && curWorm.frames[ti] && curWorm.frames[ti].doodle){
            stList = curWorm.frames[ti].doodle.map(s => s.map(p => [p[0]*W_src, p[1]*H_src]));
          }
        } else {
          if(S && Array.isArray(S.objects)){
            const objs = S.objects.filter(o => o.plane === plane.id);
            for(const o of objs){
              const ost = getObjectStrokes(o, ti);
              for(const s of (ost || [])){
                if(s && s.length >= 2) stList.push(s.map(p => [p[0] + off.dx, p[1] + off.dy]));
              }
            }
          }
          if(stList.length === 0 && curWorm.depth_worms){
            const dwObj = curWorm.depth_worms.find(d => d.id === plane.id)
              || curWorm.depth_worms.find(d => Math.abs((d.z||0) - (plane.z||0)) < 0.25 && d.role !== 'subject');
            if(dwObj && dwObj.strokes0){
              const u0 = Number.isFinite(dwObj.u0) ? dwObj.u0 : 0.5;
              const v0 = Number.isFinite(dwObj.v0) ? dwObj.v0 : 0.5;
              for(const s of dwObj.strokes0){
                if(s && s.length >= 2) stList.push(s.map(p => [(u0 + p[0])*W_src + off.dx, (v0 + p[1])*H_src + off.dy]));
              }
            }
          }
        }
        if(!stList.length) continue;
        _off128Ctx.clearRect(0, 0, 128, 96);
        _off128Ctx.save();
        _off128Ctx.scale(sx, sy);
        _off128Ctx.lineCap = 'round';
        _off128Ctx.lineJoin = 'round';
        _off128Ctx.strokeStyle = '#FFFFFF';
        _off128Ctx.lineWidth = (plane.id === 'char') ? 6.2 : (plane.z <= 1.5 ? 5.2 : 4.4);
        for(const s of stList){
          if(!s || s.length < 2) continue;
          _off128Ctx.beginPath();
          for(let i=0;i<s.length;i++){
            if(i===0) _off128Ctx.moveTo(s[i][0], s[i][1]);
            else _off128Ctx.lineTo(s[i][0], s[i][1]);
          }
          _off128Ctx.stroke();
        }
        _off128Ctx.restore();
        const aData = _off128Ctx.getImageData(0, 0, 128, 96).data;
        const lvl = inkForPlane(plane);
        for(let i=0;i<128*96;i++){
          if(aData[i*4+3] > 45 && lvl > gridLevels[i]) gridLevels[i] = lvl;
        }
      }
      gridsByFrame.push(gridLevels);
    }
    window.icaroStampDoodleFrames(gridsByFrame);
  }

  function renderAll(){
    if(!curWorm || !cvWorm) return;
    const N = (S && S.cast && S.cast.frames) ? S.cast.frames.length : (curWorm.n_frames || 1);
    if(f >= N) f = N - 1;
    if(f < 0) f = 0;
    renderWorm(f);
    if(cvStage && !stageInDotsMode){
      renderStage(f);
    }
    syncConditionalRecoveryUI();
  }

  async function loadVariantJson(worm, variant){
    curVariant = variant;
    const cacheKey = `${worm.shot_id}:${variant}`;
    if(shotCache.has(cacheKey)){
      S = shotCache.get(cacheKey);
      onShotDataReady(worm);
      return;
    }

    const bundle = window.ABC_SECONDHAND_BUNDLE;
    if(variant === 'gwp' && bundle){
      if(worm.shot_id === 'giraffe-walks-past' && bundle.gwp_shot){
        const d = hydrateShotData(bundle.gwp_shot);
        shotCache.set(cacheKey, d);
        S = d;
        onShotDataReady(worm);
        return;
      }
      const joined = bundle.joined_8 && (bundle.joined_8[worm.slug] || bundle.joined_8[worm.shot_id]);
      if(joined){
        const d = hydrateShotData(joined);
        shotCache.set(cacheKey, d);
        S = d;
        onShotDataReady(worm);
        return;
      }
    }

    let relPath = `shots/${worm.shot_id}/shot.json`;
    const urls = [
      `./${relPath}`,
      `https://hartswf0.github.io/secondhand-motion/${relPath}`
    ];
    for(const url of urls){
      try{
        const res = await fetch(url);
        if(res.ok){
          const data = hydrateShotData(await res.json());
          shotCache.set(cacheKey, data);
          if(curWorm === worm && curVariant === variant){
            S = data;
            onShotDataReady(worm);
          }
          return;
        }
      }catch(e){}
    }
    onShotDataReady(worm);
  }

  function onShotDataReady(worm){
    const N = (S && S.cast && S.cast.frames) ? S.cast.frames.length : (worm.n_frames || 1);
    buildPlanesUI();
    for(let i=0;i<N;i++) getFrameImg(worm, i);
    syncPlanesToIcaroDots();
    renderAll();
  }

  function selectShotByIdx(idx){
    if(idx < 0 || idx >= WORMS.length) return;
    curIdx = idx;
    curWorm = WORMS[idx];
    S = null;
    f = 0;
    soloPlaneId = null;
    zoomPlaneId = null;
    selectedPartId = null;
    hoveredPartId = null;
    planeOn = {};

    ['icaro-scene-select', 'sheet-a-scene-select'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = 'worm:' + curWorm.shot_id;
    });

    buildPlanesUI();
    loadVariantJson(curWorm, 'gwp');
  }

  function eventToCanvasPt(cv, e){
    const rect = cv.getBoundingClientRect();
    const clientX = (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0].clientX : ((e.touches && e.touches.length) ? e.touches[0].clientX : e.clientX);
    const clientY = (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0].clientY : ((e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY);
    const cAspect = cv.width / cv.height;
    const rAspect = rect.width / Math.max(1, rect.height);
    let drawW = rect.width, drawH = rect.height, offX = 0, offY = 0;
    if(rAspect > cAspect){
      drawW = rect.height * cAspect;
      offX = (rect.width - drawW) * 0.5;
    } else {
      drawH = rect.width / cAspect;
      offY = (rect.height - drawH) * 0.5;
    }
    return {
      x: ((clientX - rect.left - offX) / Math.max(1, drawW)) * cv.width,
      y: ((clientY - rect.top - offY) / Math.max(1, drawH)) * cv.height,
      clientX,
      clientY
    };
  }

  function findWormHit(pt){
    for(let i = wormHitBoxes.length - 1; i >= 0; i--){
      const b = wormHitBoxes[i];
      if(pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h){
        return b;
      }
    }
    return null;
  }

  function findStageHit(pt){
    let best = null, bestArea = Infinity;
    for(let i = stageHitBoxes.length - 1; i >= 0; i--){
      const b = stageHitBoxes[i];
      if(pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h){
        const area = b.w * b.h;
        if(area < bestArea){ bestArea = area; best = b; }
      }
    }
    return best;
  }

  function syncFrameToIcaroHost(newF){
    f = newF;
    if(typeof window.icaroSetCursorFromInspector === 'function'){
      window.icaroSetCursorFromInspector(f);
    }
    renderAll();
  }

  function scrubFromWormEvent(e){
    if(!curWorm) return;
    if(wormMode === 'parallel' && parallelSubMode === 'slices'){
      const pt = eventToCanvasPt(cvWorm, e);
      const hit = findWormHit(pt);
      if(hit && hit.fi !== undefined && hit.fi !== null && hit.fi !== f){
        getFrameImg(curWorm, hit.fi);
        syncFrameToIcaroHost(hit.fi);
      }
      return;
    }
    const pt = eventToCanvasPt(cvWorm, e);
    const xRel = pt.x / Math.max(1, cvWorm.width);
    let padLFrac = 0.08, padRFrac = 0.08;
    if(wormMode === 'lanes' || wormMode === 'kymo'){ padLFrac = 124 / cvWorm.width; padRFrac = 14 / cvWorm.width; }
    else if(wormMode === 'parts'){ padLFrac = 0.48; padRFrac = 0.03; }
    else if(wormMode === 'strobe'){ padLFrac = 14 / cvWorm.width; padRFrac = 14 / cvWorm.width; }
    else if(wormMode === 'anatomy'){ padLFrac = 132 / cvWorm.width; padRFrac = 24 / cvWorm.width; }
    const u = Math.max(0, Math.min(1, (xRel - padLFrac) / Math.max(0.1, 1 - padLFrac - padRFrac)));
    const N = (S && S.cast && S.cast.frames) ? S.cast.frames.length : (curWorm.n_frames || 1);
    const newF = Math.round(u * Math.max(0, N - 1));
    if(newF !== f){
      getFrameImg(curWorm, newF);
      syncFrameToIcaroHost(newF);
    }
  }

  function setStageViewMode(vMode){
    if(vMode === 'dots'){
      stageInDotsMode = true;
      if(cvStage) cvStage.style.display = 'none';
    } else {
      stageInDotsMode = false;
      view = vMode;
      if(cvStage) cvStage.style.display = 'block';
    }
    document.querySelectorAll('[data-icaro-sview]').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.icaroSview === vMode ? 'true' : 'false');
    });
    renderAll();
  }

  function mountInspector(){
    cvWorm = document.getElementById('cvWorm');
    ctxWorm = cvWorm ? cvWorm.getContext('2d') : null;
    cvStage = document.getElementById('cvStage');
    ctxStage = cvStage ? cvStage.getContext('2d') : null;
    planesRow = document.getElementById('planesRow');
    parallelSubSeg = document.getElementById('parallelSubSeg');
    parThemeBtn = document.getElementById('parThemeBtn');
    restorePlanesBtn = document.getElementById('restorePlanesBtn');
    zoomCrumbBtn = document.getElementById('zoomCrumbBtn');
    kScaleRange = document.getElementById('kScaleRange');
    kScaleLbl = document.getElementById('kScaleLbl');
    explodeRange = document.getElementById('explodeRange');
    explodeLbl = document.getElementById('explodeLbl');

    if(!cvWorm) return;

    let isScrubbingWorm = false;
    let wormDownPt = null;
    let wormDragged = false;

    cvWorm.addEventListener('pointerdown', (e)=>{
      isScrubbingWorm = true;
      wormDragged = false;
      wormDownPt = eventToCanvasPt(cvWorm, e);
      cvWorm.setPointerCapture(e.pointerId);
      const hit = findWormHit(wormDownPt);
      if(!hit){
        scrubFromWormEvent(e);
      }
    });
    cvWorm.addEventListener('pointermove', (e)=>{
      const pt = eventToCanvasPt(cvWorm, e);
      if(!isScrubbingWorm){
        const hit = findWormHit(pt);
        cvWorm.style.cursor = hit ? 'pointer' : 'ew-resize';
        const newHov = (hit && hit.selectPartId && hit.selectPartId !== '__NONE__') ? hit.selectPartId : null;
        if(newHov !== hoveredPartId){
          hoveredPartId = newHov;
          renderAll();
        }
        return;
      }
      if(wormDownPt && Math.hypot(pt.clientX - wormDownPt.clientX, pt.clientY - wormDownPt.clientY) > 6){
        wormDragged = true;
      }
      if(wormDragged){
        scrubFromWormEvent(e);
      }
    });
    cvWorm.addEventListener('pointerleave', ()=>{
      if(hoveredPartId !== null){
        hoveredPartId = null;
        renderAll();
      }
    });
    cvWorm.addEventListener('pointerup', (e)=>{
      if(isScrubbingWorm && !wormDragged && wormDownPt){
        const pt = eventToCanvasPt(cvWorm, e);
        const hit = findWormHit(pt) || findWormHit(wormDownPt);
        if(hit){
          if(hit.selectShotIdx !== undefined){
            selectShotByIdx(hit.selectShotIdx);
            isScrubbingWorm = false; wormDownPt = null; return;
          }
          if(hit.zoomPlaneOut){
            zoomPlaneId = null; selectedPartId = null;
            buildPlanesUI(); syncPlanesToIcaroDots(); renderAll();
            isScrubbingWorm = false; wormDownPt = null; return;
          }
          if(hit.zoomPlaneIn){
            zoomPlaneId = hit.zoomPlaneIn; selectedPartId = null;
            planeOn[hit.zoomPlaneIn] = true;
            buildPlanesUI(); syncPlanesToIcaroDots(); renderAll();
            isScrubbingWorm = false; wormDownPt = null; return;
          }
          if(hit.selectPartId){
            selectedPartId = (hit.selectPartId === '__NONE__') ? null : hit.selectPartId;
            if(hit.setMode){
              wormMode = hit.setMode;
              document.querySelectorAll('[data-wmode]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.wmode===wormMode?'true':'false'));
            }
            renderAll();
            isScrubbingWorm = false; wormDownPt = null; return;
          }
          if(hit.setMode){
            wormMode = hit.setMode;
            document.querySelectorAll('[data-wmode]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.wmode===wormMode?'true':'false'));
            const isPar = (wormMode === 'parallel' || wormMode === 'all');
            if(parallelSubSeg) parallelSubSeg.style.display = isPar ? '' : 'none';
            if(parThemeBtn) parThemeBtn.style.display = isPar ? '' : 'none';
            renderAll();
            isScrubbingWorm = false; wormDownPt = null; return;
          }
          if(hit.togglePlane && hit.planeId){
            togglePlaneVisibility(hit.planeId);
            buildPlanesUI();
            syncPlanesToIcaroDots();
          }
          if(hit.fi !== undefined && hit.fi !== null){
            getFrameImg(curWorm, hit.fi);
            syncFrameToIcaroHost(hit.fi);
          } else {
            renderAll();
          }
        } else {
          scrubFromWormEvent(e);
        }
      }
      isScrubbingWorm = false;
      wormDownPt = null;
    });
    cvWorm.addEventListener('pointercancel', ()=>{ isScrubbingWorm = false; wormDownPt = null; });

    if(cvStage){
      cvStage.addEventListener('pointermove', (e)=>{
        const pt = eventToCanvasPt(cvStage, e);
        const hit = findStageHit(pt);
        cvStage.style.cursor = hit ? 'pointer' : 'default';
        const newHov = hit ? hit.partId : null;
        if(newHov !== hoveredPartId){
          hoveredPartId = newHov;
          renderAll();
        }
      });
      cvStage.addEventListener('pointerleave', ()=>{
        if(hoveredPartId !== null){
          hoveredPartId = null;
          renderAll();
        }
      });
      cvStage.addEventListener('click', (e)=>{
        const pt = eventToCanvasPt(cvStage, e);
        const hit = findStageHit(pt);
        if(hit && hit.partId){
          selectedPartId = (selectedPartId === hit.partId) ? null : hit.partId;
          if(selectedPartId && wormMode !== 'parts'){
            wormMode = 'parts';
            document.querySelectorAll('[data-wmode]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.wmode==='parts'?'true':'false'));
            if(parallelSubSeg) parallelSubSeg.style.display = 'none';
            if(parThemeBtn) parThemeBtn.style.display = 'none';
          }
          renderAll();
        }
      });
    }

    document.querySelectorAll('[data-wmode]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        wormMode = btn.dataset.wmode;
        document.querySelectorAll('[data-wmode]').forEach(b=>b.setAttribute('aria-pressed', b===btn?'true':'false'));
        const isPar = (wormMode === 'parallel' || wormMode === 'all');
        if(parallelSubSeg) parallelSubSeg.style.display = isPar ? '' : 'none';
        if(parThemeBtn) parThemeBtn.style.display = isPar ? '' : 'none';
        renderAll();
      });
    });

    document.querySelectorAll('[data-psub]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        parallelSubMode = btn.dataset.psub;
        document.querySelectorAll('[data-psub]').forEach(b=>b.setAttribute('aria-pressed', b===btn?'true':'false'));
        renderAll();
      });
    });

    if(parThemeBtn){
      parThemeBtn.addEventListener('click', ()=>{
        parallelDark = !parallelDark;
        parThemeBtn.setAttribute('aria-pressed', String(parallelDark));
        renderAll();
      });
    }

    document.querySelectorAll('[data-icaro-sview]').forEach(btn=>{
      btn.addEventListener('click', ()=> setStageViewMode(btn.dataset.icaroSview));
    });

    if(zoomCrumbBtn){
      zoomCrumbBtn.addEventListener('click', ()=>{
        if(selectedPartId !== null) selectedPartId = null;
        else if(zoomPlaneId !== null) zoomPlaneId = null;
        buildPlanesUI();
        syncPlanesToIcaroDots();
        renderAll();
      });
    }
    if(restorePlanesBtn){
      restorePlanesBtn.addEventListener('click', ()=>{
        soloPlaneId = null; zoomPlaneId = null; selectedPartId = null; planeOn = {};
        buildPlanesUI();
        syncPlanesToIcaroDots();
        renderAll();
      });
    }
    if(kScaleRange){
      kScaleRange.addEventListener('input', ()=>{
        kScale = parseFloat(kScaleRange.value) || 1.0;
        if(kScaleLbl) kScaleLbl.textContent = 'k×' + kScale.toFixed(1);
        syncPlanesToIcaroDots();
        renderAll();
      });
    }
    if(explodeRange){
      explodeRange.addEventListener('input', ()=>{
        explodeAmt = parseFloat(explodeRange.value) || 0;
        if(explodeLbl) explodeLbl.textContent = 'Exp ' + Math.round(explodeAmt * 100) + '%';
        syncPlanesToIcaroDots();
        renderAll();
      });
    }

    const data = window.SECONDHAND_WORMS_108;
    WORMS = (data && data.worms) ? data.worms : [];
    const bundle = window.ABC_SECONDHAND_BUNDLE || {};
    const films = bundle.films ? Object.keys(bundle.films).sort() : [];

    ['icaro-scene-select', 'sheet-a-scene-select'].forEach(id => {
      const sel = document.getElementById(id);
      if(!sel) return;
      sel.innerHTML = '';
      const grp1 = document.createElement('optgroup');
      grp1.label = 'Multiplane Scenes (109)';
      WORMS.forEach((w) => {
        const opt = document.createElement('option');
        opt.value = 'worm:' + w.shot_id;
        const nP = (w.depth_worms && w.depth_worms.length) || (w.planes && w.planes.length) || 2;
        opt.textContent = `${w.lot ? w.lot + ' · ' : ''}${w.title || w.slug} (${nP} Planes · ${w.n_frames}f)`;
        grp1.appendChild(opt);
      });
      sel.appendChild(grp1);

      if(films.length){
        const grp2 = document.createElement('optgroup');
        grp2.label = 'BEFLIX Dot-Matrix Films (20)';
        films.forEach(fk => {
          const opt = document.createElement('option');
          opt.value = 'film:' + fk;
          opt.textContent = `Film: ${fk}`;
          grp2.appendChild(opt);
        });
        sel.appendChild(grp2);
      }
    });

    // Default to Composite stage + 2 · Planes bottom view on Giraffe Walks Past!
    setStageViewMode('composite');
    if(WORMS.length){
      selectShotByIdx(0);
    }
  }

  window.ICARO_SECONDHAND_INSPECTOR = {
    mount: mountInspector,
    setFrame: function(newF){
      if(newF !== f){
        f = newF;
        renderAll();
      }
    },
    selectSceneValue: function(val){
      if(!val) return;
      if(val.startsWith('film:')){
        setStageViewMode('dots');
        if(typeof window.icaroRunBeflixFilmKey === 'function'){
          window.icaroRunBeflixFilmKey(val.slice(5));
        }
        return;
      }
      const shotId = val.startsWith('worm:') ? val.slice(5) : val;
      const idx = WORMS.findIndex(w => w.shot_id === shotId || w.slug === shotId);
      if(idx >= 0) selectShotByIdx(idx);
    },
    setStageViewMode: setStageViewMode,
    renderAll: renderAll
  };
})();
