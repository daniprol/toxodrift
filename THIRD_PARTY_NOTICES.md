# Third-party notices

## dRally

Asset decoding, stock vehicle parameters, drivetrain equations, collision impulses, armor and weapon damage/timing, AI probes, checkpoint rules, scenery projection, menu glyph advances and instrument layout were adapted from [urxp/dRally](https://github.com/urxp/dRally), commit `920d85a7f3c3b95abb685bc26b5f6d67a2f4b982`. The TypeScript rewrite uses different interfaces and records known deviations in `docs/port-status.md`.

```text
MIT License

Copyright (c) 2019 Neomalius (urxp)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Death Rally assets

Death Rally and its original graphics, sounds, music and track data belong to Remedy Entertainment and their respective rights holders. The source-code license does not license those assets. They are downloaded separately for this local installation and excluded from Git. The unmodified license is extracted with the game in `.local/original/license.txt`.

## Other references and dependencies

[DreeRally](https://github.com/enriquesomolinos/DreeRally) was consulted to cross-check names and format descriptions. Its code is not vendored. Package licenses remain with their installed packages. FFmpeg/libopenmpt is an external import-time tool and is not included in the application bundle.
