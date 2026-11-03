"""試作 (#10): 生成 → 検証 → 整合しなければ引き直し (棄却サンプリング)。標準ライブラリのみ。製品のコードではない。"""
import gen
import verify


def generate_checked(seed, plausible_drivers=True, max_attempts=50):
    """(dict, 試行回数) を返す。hard の全規則を通るまで種を変えて引き直す。"""
    for a in range(max_attempts):
        d = gen.generate(seed, plausible_drivers, attempt=a)
        if not verify.verify(d)["hard_fail"]:
            return d, a + 1
    raise RuntimeError(f"seed {seed}: {max_attempts} 回で整合しなかった")
