import pathlib

with open(pathlib.Path('./test/index.html'), "w") as file:
    file.write("<h1>Breaking Change</h1>")

with open(pathlib.Path('./test/main.js'), "w") as file:
    file.write("console.log('Breaking Change')")