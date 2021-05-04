import pathlib

with open(pathlib.Path('./test/index.html'), "w") as file:
    file.write("<h1>Breaking index.html change</h1>")

with open(pathlib.Path('./test/main.js'), "w") as file:
    file.write("console.log('Breaking main.js change');")

with open(pathlib.Path('./test/polyfills.js'), "w") as file:
    file.write("console.log('Breaking polyfills.js change');")

with open(pathlib.Path('./test/polyfills-es5.js'), "w") as file:
    file.write("console.log('Breaking polyfills-es5.js change');")

with open(pathlib.Path('./test/styles.css'), "w") as file:
    file.write(".breakingStylesChange {}")

with open(pathlib.Path('./test/scripts.js'), "w") as file:
    file.write("console.log('Breaking scripts.js change');")

with open(pathlib.Path('./test/logout.html'), "w") as file:
    file.write("<h1>Breaking logout.html change</h1>")
