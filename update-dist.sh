#!/bin/bash

npm install
npm i -g @vercel/ncc

ncc build index.js

