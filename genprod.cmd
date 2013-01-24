call "c:\Utilites\nodejs\nodevars.bat"
copy /Y *.* .\prod\*.*
cd prod
for %%F IN (*.js) DO uglifyjs %%F -m -o %%F
pause