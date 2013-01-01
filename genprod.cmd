call "c:\Program Files\nodejs\nodejsvars.bat"
copy /Y *.* .\prod\*.*
for %%F IN (*.js) DO @uglifyjs -mt -o .\prod\%%F %%F