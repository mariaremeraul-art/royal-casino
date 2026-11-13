# Quita los círculos detrás de algunos símbolos (uva, sandía, estrella y campana) en la tragaperras 2D y la Slots 5:
# eran las «placas de jerarquía» data-tier 2 (aro discontinuo) y data-tier 0 (aro de rayos de la estrella).
# Se mantiene la placa hexagonal de 7/diamante (tier 1) y el resaltado de premio (.hit).
P='/workspace/royal-casino/index.html'
s=open(P,encoding='utf-8').read()
def rep(a,b):
    global s
    assert s.count(a)==1,a; s=s.replace(a,b,1)
if 'sin círculos detrás' in s: raise SystemExit('ya aplicado')
a=s[s.index('[data-tier="2"]::before{width:46px'):]; a=a[:a.index('\n')+1]
rep(a,'')
a=s[s.index('[data-tier="0"]::before{width:50px'):]; a=a[:a.index('\n')+1]
rep(a,'[data-tier="0"]::before,[data-tier="2"]::before{content:none!important} /* sin círculos detrás de las frutas/estrella */\n')
rep('#sx-grid .sx-strip div[data-tier="2"]::before{width:40px;height:40px}\n','')
open(P,'w',encoding='utf-8').write(s); print('ok',len(s.encode()))
