# Slots 5 en 3D: ganchos en sxPaint/sxAnim/sxSpin (solo avisan a la capa 3D; no tocan premios) y CSS.
p='/workspace/royal-casino/index.html'; s=open(p).read()
def rep(a,b):
    global s
    if b in s: return
    assert a in s, a[:60]; s=s.replace(a,b,1)
rep("  box.innerHTML=h+'<svg id=\"sx-lines\" preserveAspectRatio=\"none\" viewBox=\"0 0 500 186\"></svg>';\n  return grid;",
    "  box.innerHTML=h+'<svg id=\"sx-lines\" preserveAspectRatio=\"none\" viewBox=\"0 0 500 186\"></svg>';\n  try{ if(window.SX3D) SX3D.sync({st:sxCols.map(c=>c.slice())}); }catch(e){}\n  return grid;")
rep("    const RND=c=>sxRand(c), FIN=[], lands=[];","    const RND=c=>sxRand(c), FIN=[], lands=[], ST3=[];")
rep("st.push(grid[c],grid[5+c],grid[10+c]); FIN[c]=st.length-3;","st.push(grid[c],grid[5+c],grid[10+c]); FIN[c]=st.length-3; ST3[c]=st.slice();")
rep("    const durs=still?[80,100,120,140,160]:[1200,1500,1800,2100,2400], start=performance.now();\n",
    "    const durs=still?[80,100,120,140,160]:[1200,1500,1800,2100,2400], start=performance.now();\n    try{ if(window.SX3D) SX3D.spin({st:ST3, fin:FIN.slice(), durs:durs.slice(), still}); }catch(e){}\n")
rep("  let hits=0, pay=0; const det=[];","  let hits=0, pay=0; const det=[], sx3dL=[];")
rep("if(a===b&&b===c){ hits++;","if(a===b&&b===c){ sx3dL.push(SX_LINEAS.indexOf(L)); hits++;")
rep("  recordPlay('Slots líneas',bet,pay-bet,hits+' líneas');",
    "  try{ if(window.SX3D) SX3D.result({grid:grid.slice(), lines:sx3dL, cash:pay, net:pay-bet, ap:bet, bote:bote>0, win:hits>0||bote>0}); }catch(e){}\n  recordPlay('Slots líneas',bet,pay-bet,hits+' líneas');")
rep('<button class="gold" onclick="sxSpin()">Girar</button>','<button class="gold" id="sx-girar" onclick="sxSpin()">Girar</button>')
if 'id="sx3d-css"' not in s:
    s=s.replace('</head>',open('/workspace/slot3d/src/sx3d.css').read()+'</head>',1)
i=s.index('/* Blackjack 3D +'); j=s.index('\n',i)+1; k=s.index('\n</script>',j)
s=s[:i]+'/* Blackjack 3D + Tragaperras 3D + Slots 5 3D · three.js r187 (MIT) recortado con esbuild; capas visuales, no tocan la lógica de premios */\n'+open('/workspace/slot3d/dist/casino3d.min.js').read().strip()+s[k:]
open(p,'w').write(s); print('sx5_patch ok')
