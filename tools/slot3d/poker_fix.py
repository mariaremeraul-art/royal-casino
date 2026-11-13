# Arreglo del Póker de 2 cartas (vs crupier): «Repetir» seguía activo durante la mano y empezaba otra
# encima (cobraba otra apuesta y tiraba la que estaba en juego, también la subida). Se aplica sobre index.html.
P='/workspace/royal-casino/index.html'
s=open(P,encoding='utf-8').read()
def rep(a,b):
    global s
    assert s.count(a)==1,a; s=s.replace(a,b,1)
if 'pkLive' in s: raise SystemExit('ya aplicado')
rep("let pkB=[],pkJ=[],pkC=[],pkAp=0,pkUlt=0,pkMode='solo';",
    "let pkB=[],pkJ=[],pkC=[],pkAp=0,pkUlt=0,pkMode='solo',pkLive=false; // pkLive: hay una mano en juego (no se puede empezar otra)")
rep("async function pkNueva(){ const a=await pedirApuestaMesa('poker');",
    "async function pkNueva(){ if(pkLive) return; const a=await pedirApuestaMesa('poker'); if(pkLive) return;")
rep("function pkRepetir(){ if(!repGo('poker',pkUlt)) return; pkStart(pkUlt); }",
    "function pkRepetir(){ if(pkLive) return; if(!repGo('poker',pkUlt)) return; pkStart(pkUlt); }")
rep("function pkStart(a){ pkAp=a; pkUlt=a; saldo-=a; updSaldo();",
    "function pkStart(a){ if(pkLive) return; pkLive=true; pkRaised=0; pkAp=a; pkUlt=a; saldo-=a; updSaldo(); if($('pk-repetir')) $('pk-repetir').disabled=true;")
rep("async function pkSubir(){\n  if(!pkAp) return;\n  const extra=await pedirApuestaMesa('poker');\n  if(extra==null) return;",
    "async function pkSubir(){\n  if(!pkLive||!pkAp) return;\n  const extra=await pedirApuestaMesa('poker');\n  if(extra==null||!pkLive) return;")
rep("function pkRetirar(){\n", "function pkRetirar(){\n  if(!pkLive) return; pkLive=false;\n")
rep("function pkResolver(){\n", "function pkResolver(){\n  if(!pkLive || pkJ.length<2 || pkC.length<2) return; pkLive=false;\n")
# mensaje claro: lo que cobras y lo que ganas de verdad (la apuesta ya se descontó al repartir)
rep("if(rJ>rC){ saldo+=pkAp*2; msg='¡Ganas +$'+(pkAp*2)+'!';",
    "if(rJ>rC){ saldo+=pkAp*2; msg='¡Ganas! Cobras '+fxM(pkAp*2)+' ('+fxNet(pkAp)+')';")
rep("if(cmp>0){saldo+=pkAp*2;msg='¡Ganas por desempate +$'+(pkAp*2)+'!';",
    "if(cmp>0){saldo+=pkAp*2;msg='¡Ganas por desempate! Cobras '+fxM(pkAp*2)+' ('+fxNet(pkAp)+')';")
rep("msg='Gana el crupier · pierdes $'+pkAp;", "msg='Gana el crupier · pierdes '+fxM(pkAp);")
rep("msg='Pierdes el desempate · $'+pkAp;", "msg='Pierdes el desempate · '+fxM(pkAp);")
rep("setInfo('pk-info','Te retiras. Pierdes $'+pkAp,'lose');", "setInfo('pk-info','Te retiras. Pierdes '+fxM(pkAp),'lose');")
open(P,'w',encoding='utf-8').write(s); print('ok',len(s.encode()))
