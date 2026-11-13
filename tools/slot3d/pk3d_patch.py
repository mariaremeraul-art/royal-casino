# Póker de 2 cartas en 3D: avisos a la capa 3D (no cambian apuestas ni pagos) + CSS de móvil (3D y 2D, y botones del blackjack).
p='/workspace/royal-casino/index.html'; s=open(p).read()
def rep(a,b):
    global s
    if b in s: return
    assert s.count(a)==1, a[:70]; s=s.replace(a,b,1)
H="function pk3d(show,res){ try{ if(window.PK3D) PK3D.sync({c:pkC.length?pkC.map(c=>show?c[0]+c[1]:null):[], j:pkJ.map(c=>c[0]+c[1]), ap:pkAp, res:res||''}); }catch(e){} } // solo dibuja; la lógica no depende del 3D\n"
rep("function pkBet(n,label){",H+"function pkBet(n,label){")
rep("$('pk-solo-btns').style.display=m==='solo'?'':'none';","$('pk-solo-btns').style.display=m==='solo'?'':'none'; try{ if(window.PK3D) PK3D.check(); }catch(e){}")
# nueva mano: mesa limpia y reparto (2 boca abajo para la crupier, tus cartas boca arriba)
rep("  pcRender('pk-crupier',[null,null]); pkBet(a,'Apuesta');","  pcRender('pk-crupier',[null,null]); pkBet(a,'Apuesta'); try{ if(window.PK3D) PK3D.sync({c:[],j:[],ap:0,res:''}); }catch(e){}")
rep("  pcRender('pk-mano',pkJ); SFX.deal();\n}","  pcRender('pk-mano',pkJ); SFX.deal(); pk3d(false);\n}")
rep("pcRender('pk-mano',pkJ); pkNow(); setInfo('pk-info','Sube, iguala o retírate');","pcRender('pk-mano',pkJ); pk3d(false); pkNow(); setInfo('pk-info','Sube, iguala o retírate');")
rep("pkRaised+=extra; updSaldo(); pkBet(pkAp,'Apuesta');","pkRaised+=extra; updSaldo(); pkBet(pkAp,'Apuesta'); pk3d(false);")
rep("  recordPlay('Póker',pkAp,-pkAp,'Fold');","  pk3d(true,'fold');\n  recordPlay('Póker',pkAp,-pkAp,'Fold');")
rep("  setInfo('pk-info',msg,cls); if($('pk-why')) $('pk-why').textContent=why;","  setInfo('pk-info',msg,cls); if($('pk-why')) $('pk-why').textContent=why; pk3d(true, cls==='win'?'win':cls==='lose'?'lose':'push');")
if 'id="pk3d-css"' not in s: s=s.replace('</head>',open('/workspace/slot3d/src/pk3d.css').read()+'</head>',1)
i=s.index('/* Blackjack 3D +'); j=s.index('\n',i)+1; k=s.index('\n</script>',j)
s=s[:i]+'/* Blackjack 3D + Póker de 2 cartas 3D + Tragaperras 3D + Slots 5 3D · three.js r187 (MIT) recortado con esbuild; capas visuales, no tocan la lógica de premios */\n'+open('/workspace/slot3d/dist/casino3d.min.js').read().strip()+s[k:]
open(p,'w').write(s); print('pk3d_patch ok')
