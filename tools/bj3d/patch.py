import re
P='/workspace/royal-casino/index.html'
s=open(P,encoding='utf-8').read()
assert 'bj3d-cv' not in s
css='''<style id="bj3d-css">
/* Blackjack 3D: el lienzo WebGL sustituye al tapete; si no hay WebGL no se aplica nada */
#blackjack .bj-table.bj3d{padding:0!important;min-height:0;overflow:hidden;background:#12040c!important;border-color:#c9a227;height:clamp(200px,calc(100vh - 520px),323px);height:clamp(200px,calc(100dvh - 520px),323px)}
@media (min-width:901px){#blackjack .bj-table.bj3d{height:auto}}
@media (max-width:900px) and (max-height:950px){
#blackjack:has(.bj-table.bj3d) h2{margin:0 0 4px;font-size:20px}
#blackjack:has(.bj-table.bj3d) .mesa-picker{padding:0 0 4px}
#blackjack:has(.bj-table.bj3d) .mesa-btn{padding:6px 4px}
#blackjack:has(.bj-table.bj3d) .mesa-tag{margin:0 0 4px}
#blackjack:has(.bj-table.bj3d) .bj-side{font-size:11px;line-height:1.25;padding:5px 8px 5px 32px;margin:4px 0;background-size:16px 16px;background-position:8px 6px}
#blackjack:has(.bj-table.bj3d) #bj-info,#blackjack:has(.bj-table.bj3d) .info{margin:2px 0 4px!important}
#blackjack .bj-table.bj3d{margin-top:6px;margin-bottom:0}
#blackjack .bj-table.bj3d + .btn-row{margin-top:8px}
}
#blackjack .bj-table.bj3d::before,#blackjack .bj-table.bj3d::after{display:none}
#blackjack .bj-table.bj3d > canvas.bj3d-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;z-index:0}
#blackjack .bj-table.bj3d .bj-label{position:absolute;z-index:2;transform:translate(-50%,0);margin:0!important;white-space:nowrap;background:rgba(0,0,0,.5);border-radius:999px;padding:2px 10px;font-size:.74rem;pointer-events:none}
#blackjack .bj-table.bj3d #bj-label-j{left:50%;top:auto;bottom:6px}
#blackjack .bj-table.bj3d #bj-label-c{left:50%;top:8px}
#blackjack .bj-table.bj3d-split #bj-label-j{display:none}
#blackjack .bj-table.bj3d .bj-split{position:absolute;inset:0;z-index:2;pointer-events:none;display:block}
#blackjack .bj-table.bj3d .bj-sub{position:absolute;transform:translate(-50%,0);width:auto;min-width:0;padding:0;background:none!important;border:0!important;box-shadow:none!important}
#blackjack .bj-table.bj3d .bj-hand{position:absolute;left:50%;top:-60px;width:1px;height:1px;min-height:0!important;overflow:hidden;visibility:hidden}
#blackjack .bj-table.bj3d .bet-spot{margin:0 auto;min-height:0}
#blackjack .bj-table.bj3d .bet-spot .chips{transform:scale(.9)}
#blackjack .bj-table.bj3d .bj-sublab{background:rgba(0,0,0,.5);border-radius:999px;padding:1px 8px;margin-bottom:3px;white-space:nowrap}
#blackjack .bj-table.bj3d .bj-sublab:empty{display:none}
#blackjack .bj-table.bj3d .bj-split.split .bj-sub.on .bj-sublab{border:1px solid #ffe14d;box-shadow:0 0 8px rgba(255,225,77,.5)}
</style>
</head>'''
assert s.count('</head>')==1
s=s.replace('</head>',css,1)
old="  if(bjPhase!=='end') bjMesa(!!hide,null);\n}"
assert s.count(old)==1
s=s.replace(old,"  if(bjPhase!=='end') bjMesa(!!hide,null);\n  try{ if(window.BJ3D) BJ3D.sync({c:bjC.map((c,i)=>hide&&i===0?null:c), hands:bjHands.map(h=>({cards:h.cards.slice(),res:h.res})), split:bjSplit, cur:bjCur, phase:bjPhase}); }catch(e){}\n}",1)
js=open('/workspace/bj3d/dist/bj3d.min.js',encoding='utf-8').read().strip()
assert '</script' not in js.lower() and '<!--' not in js
tag='<script>\n/* Blackjack 3D · three.js r187 (MIT) recortado con esbuild; capa visual sobre bjRender */\n'+js+'\n</script>\n</body>'
assert s.count('</body>')==1
s=s.replace('</body>',tag,1)
open(P,'w',encoding='utf-8').write(s)
print('ok',len(s.encode()))
