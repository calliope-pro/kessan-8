# Third-Party Notices

このディレクトリ (`.claude/skills/impeccable/`) の中の、上流 [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0。`LICENSE`・`NOTICE.md`) に由来するファイルのうち、さらに第三者の著作物を含むものの表示。ライセンスの全文は、取得元の原文をそのまま写した (改変なし)。上流のファイル自体は変えていない。

## 1. modern-screenshot 4.7.0

- 対象: `scripts/modern-screenshot.umd.js` (npm の `modern-screenshot@4.7.0` の `dist/index.js` と SHA-256 `bb36665889124a0b6e15f16045265737449c3bdcf2712cdb08af3cfa01563e2b` で一致)
- 作者: wxm
- 取得元: https://www.npmjs.com/package/modern-screenshot / https://github.com/qq15725/modern-screenshot (npm パッケージの `LICENSE` を `npm pack modern-screenshot@4.7.0` で取得)
- ライセンス: MIT。以下はその全文 (原文のまま)

```text
The MIT License (MIT)

Copyright (c) 2021-present wxm

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## 2. ehmo/platform-design-skills

- 対象: `reference/ios.md`・`reference/android.md` (上流 impeccable の `NOTICE.md` が「ehmo の `platform-design-skills` (Apple Human Interface Guidelines と Material Design 3 の規則) から要約し、impeccable の文体で書き直したもの」と記すもの)
- 作者: ehmo
- 取得元: https://github.com/ehmo/platform-design-skills (`LICENSE` を `gh api repos/ehmo/platform-design-skills/contents/LICENSE` で取得。GitHub の判定も MIT)
- ライセンス: MIT。以下はその全文 (原文のまま。著作権の行は上流の原文のとおり `Copyright (c) 2026` で、名前の記載は無い)

```text
MIT License

Copyright (c) 2026

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

## 3. 同梱していない・含まない第三者のもの

- 実行形式 (`scripts/bin/`、engine 0.1.18) は gitignore で、このリポジトリには入れていない
- `scripts/data/font-index.json` は、フォントの名前と寸法の特徴量の索引で、フォント本体は含まない
