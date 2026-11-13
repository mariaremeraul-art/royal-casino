# Aplica la tragaperras 3D sobre la copia previa (/workspace/royal-casino-backup-antes-slot3d.html) y escribe index.html.
# Sustituye el bundle del blackjack 3D por el bundle común (three.js una sola vez) y añade CSS + 3 enganches visuales.
SRC='/workspace/royal-casino-backup-antes-slot3d.html'
import os; P=os.environ.get("OUT","/workspace/royal-casino/index.html")
s=open(SRC,encoding='utf-8').read()
assert 'sl3d-cv' not in s
old_js=open('/workspace/bj3d/dist/bj3d.min.js',encoding='utf-8').read().strip()
assert s.count(old_js)==1
js=open('/workspace/slot3d/dist/casino3d.min.js',encoding='utf-8').read().strip()
assert '</script' not in js.lower() and '<!--' not in js
s=s.replace('/* Blackjack 3D · three.js r187 (MIT) recortado con esbuild; capa visual sobre bjRender */\n'+old_js,
            '/* Blackjack 3D + Tragaperras 3D · three.js r187 (MIT) recortado con esbuild; capas visuales, no tocan la lógica */\n'+js,1)
assert s.count(js)==1
css='''<style id="sl3d-css">
/* Tragaperras 3D: el lienzo WebGL sustituye a los rodillos 2D; sin WebGL no se aplica nada */
#slots-machine.sl3d{max-width:620px;padding:0!important;border:0!important;background:none!important;box-shadow:none!important;animation:none!important;margin:8px auto}
#slots-machine.sl3d::before,#slots-machine.sl3d::after{display:none!important}
#slots-machine.sl3d .slots-window{display:none!important}
#slots-machine.sl3d #tr-jackpot{margin:0 auto 6px}
#slots-machine.sl3d .sl3d-stage{position:relative;width:100%;height:340px;border-radius:14px;overflow:hidden;background:#0b0408;box-shadow:0 8px 28px rgba(0,0,0,.55)}
#slots-machine.sl3d .sl3d-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:manipulation}
/* La barra inferior no tapa el final de ninguna pantalla: altura real de la barra + zona segura + margen */
body{padding-bottom:calc(var(--nav-h) + env(safe-area-inset-bottom) + 16px)}
@media (max-width:900px){
/* tragaperras (3D y 2D): cabecera compacta para que Girar y «← Juegos» quepan sobre la barra al entrar */
#tragaperras h2{margin:0 0 4px;font-size:20px}
#tragaperras .mesa-picker{padding:0 0 4px}
#tragaperras .mesa-btn{padding:6px 4px}
#tragaperras .mesa-tag{margin:0 0 4px}
#tragaperras .tr-pagos{margin:2px 0}
#tragaperras #tr-info{margin:4px 0!important}
#tragaperras .btn-row{margin-top:8px}
#slots-machine.sl3d{margin:4px auto}
#slots-machine.sl3d #tr-jackpot{min-height:0;padding:4px 10px;margin-bottom:4px}
#slots-machine:not(.sl3d){margin:8px auto;padding-top:40px}
#tragaperras .btn-row{flex-wrap:nowrap;gap:8px}
#tragaperras .btn-row button{min-width:0;flex:0 1 auto;padding-left:14px;padding-right:14px;white-space:nowrap}
}
</style>
</head>'''
assert s.count('</head>')==1
s=s.replace('</head>',css,1)
def rep(old,new):
    global s
    assert s.count(old)==1,old
    s=s.replace(old,new,1)
# 1) reposo: al entrar se pintan las mismas tiras que la vista 2D
rep("$('strip'+c).style.transform='translateY(-'+9*SH+'px)'; trTop[c]=9; } if(typeof boteRefresh==='function') boteRefresh();",
    "$('strip'+c).style.transform='translateY(-'+9*SH+'px)'; trTop[c]=9; } try{ if(window.SLOT3D) SLOT3D.sync({st:trStrips.map(x=>x.slice()), fin:trTop.slice()}); }catch(e){} if(typeof boteRefresh==='function') boteRefresh();")
# 2) giro: el 3D recibe las tiras ya decididas y las mismas duraciones
rep("  const durs=still?[80,120,160]:[1600,2200,2800], start=performance.now();\n",
    "  const durs=still?[80,120,160]:[1600,2200,2800], start=performance.now();\n  try{ if(window.SLOT3D) SLOT3D.spin({st:trStrips.map(x=>x.slice()), fin:FIN.slice(), durs:durs.slice(), still:still, vip:vipSpin}); }catch(e){}\n")
# 3) premio: solo efectos (brillo, monedas); el pago ya está hecho
rep("  recordPlay('Tragaperras',ap||0,net,msg);\n",
    "  try{ if(window.SLOT3D) SLOT3D.result({r:r.slice(), cash:cash, net:net, ap:ap||0, st:st, win:win}); }catch(e){}\n  recordPlay('Tragaperras',ap||0,net,msg);\n")
open(P,'w',encoding='utf-8').write(s)
print('ok',len(s.encode()))
