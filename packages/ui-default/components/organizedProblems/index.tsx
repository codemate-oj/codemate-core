import './index.css';

import { flatten, sum } from 'lodash';
import React, { useEffect, useMemo, useState } from 'react';

const categoryOptions = ['单选题', '判断题', '多选题', '填空题', '程序分析题', '完善程序题', '编程题', '未分类'];

interface ProblemType {
  key: string;
  docId: number;
  pid: string;
  score: string;
}

interface CategoryType {
  key: string;
  name: string;
  shuffle: boolean;
  problems: ProblemType[];
}

type Props = {
  onProblemChange?: (pids: string) => void;
  fetchProblem?: (pid: string) => Promise<Partial<ProblemType>>;
  fetchAll?: (pids: number[]) => Promise<Partial<ProblemType>[]>;
  defaultValue?: string;
};

function convertNumberToChinese(num: number) {
  const chineseNumbers = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const units = ['', '十', '百', '千', '万', '十万', '百万', '千万', '亿'];

  const numStr = num.toString();
  let result = '';
  let zeroFlag = false; // 用于处理多个零的情况

  // 从个位开始，逆序遍历
  for (let i = 0; i < numStr.length; i++) {
    const digit = parseInt(numStr.charAt(i), 10);
    const position = numStr.length - i - 1;

    if (digit === 0) {
      // 如果当前数字是零，并且前面没有零，添加零
      if (!zeroFlag) {
        result += chineseNumbers[digit];
        zeroFlag = true;
      }
    } else {
      // 如果当前数字不是零，重置 zeroFlag
      zeroFlag = false;
      result += chineseNumbers[digit] + units[position % 4]; // 根据位置加单位
    }
  }

  // 处理 "一十" 的情况，直接输出 "十"
  if (result.startsWith('一十')) {
    result = result.substring(1);
  }
  // 处理类似 "十零" 的情况，直接输出 "十"
  if (result.length > 1 && result.endsWith('零')) {
    result = result.substring(0, result.length - 1);
  }

  return result;
}

function getProblemTemplate() {
  return {
    key: `${new Date().getTime()}-0`,
    docId: 0,
    pid: '',
    score: '',
  };
}

function getCategoryTemplate() {
  return {
    key: `${new Date().getTime()}-0`,
    name: '',
    shuffle: false,
    problems: [],
  };
}

const ConfigProblems = ({ onProblemChange, fetchAll, fetchProblem, defaultValue }: Props) => {
  const [totalScore, setTotalScore] = useState('');
  const [defaultTotalScore, setDefaultTotalScore] = useState('');
  const [defaultPerScore, setDefaultPerScore] = useState(100);
  const [items, setItems] = useState<CategoryType[]>([]);

  const flattenProblems = useMemo(() => {
    return flatten(items.map((v) => v.problems));
  }, [items]);

  const flattenConfirmProblems = useMemo(() => {
    return flattenProblems.filter((p) => p.pid && p.docId);
  }, [flattenProblems]);

  const problemsTotalScore = useMemo(() => {
    return sum(flattenConfirmProblems.map((p) => +p.score || defaultPerScore));
  }, [flattenConfirmProblems, defaultPerScore]);

  const noZeroScores = useMemo(() => {
    return flattenConfirmProblems.map((v) => +v.score).filter((v) => v);
  }, [flattenConfirmProblems]);

  const problemCategoryConfig = useMemo(() => {
    return JSON.stringify(
      items
        .map(({ shuffle, name, problems }) => ({
          name,
          shuffle,
          problems: problems.filter((v) => v.docId).map(({ docId, score }) => ({ docId, score: +score || defaultPerScore })),
        }))
        .filter((v) => v.problems.length),
      null,
      2,
    );
  }, [items, defaultPerScore]);

  const problemsIds = useMemo(() => {
    return flattenConfirmProblems
      .map((p) => p.docId)
      .filter((v) => v)
      .join(',');
  }, [flattenConfirmProblems]);

  const toFetchIds = useMemo(() => {
    return flattenProblems
      .filter((p) => p.docId && !p.pid)
      .map((p) => p.docId)
      .join(',');
  }, [flattenProblems]);

  const getInitCategory = () => {
    const category: CategoryType = getCategoryTemplate();
    category.key = `${category.key}${items.length}`;
    category.name = [...categoryOptions.filter((label) => !items.some((v) => v.name === label)), categoryOptions[0]][0];
    category.problems.push(getProblemTemplate());
    return category;
  };

  useEffect(() => {
    if (totalScore && noZeroScores.length) {
      const restScore = +totalScore - sum(noZeroScores);
      const defaultScoreCount = flattenConfirmProblems.length - noZeroScores.length;
      if (defaultScoreCount) {
        setDefaultPerScore(+((restScore > 0 ? restScore : 0) / defaultScoreCount).toFixed(2) || 100);
      }
    }
  }, [noZeroScores, totalScore, flattenConfirmProblems]);

  useEffect(() => {
    onProblemChange?.(problemsIds);
  }, [problemsIds]);

  useEffect(() => {
    const ids = toFetchIds.split(',').map((v) => +v);
    if (toFetchIds) {
      fetchAll?.(ids).then((infoList) => {
        setItems(
          items
            .map((v) => {
              return {
                ...v,
                problems: v.problems.map((problem) => {
                  if (ids.includes(problem.docId)) {
                    return {
                      ...problem,
                      ...(infoList.find((p) => p.docId === problem.docId) || {
                        docId: 0,
                        pid: '',
                      }),
                    };
                  }
                  return problem;
                }),
              };
            })
            .filter((v) => v.problems.length),
        );
      });
    }
  }, [toFetchIds]);

  useEffect(() => {
    // setTotalScore(`${problemsTotalScore || ''}`);
    setDefaultTotalScore(`${problemsTotalScore || ''}`);
  }, [problemsTotalScore]);

  useEffect(() => {
    if (defaultValue) {
      let count = 0;
      setItems(
        JSON.parse(defaultValue).map((v: Partial<CategoryType>) => {
          const category = getInitCategory();
          category.shuffle = v.shuffle || false;
          category.name = v.name || '未分类';
          category.key = `${category.key}${count++}`;
          if (v.problems) {
            category.problems =
              v.problems.map((p: Partial<ProblemType>, j) => {
                const problem = getProblemTemplate();
                problem.pid = p.pid || '';
                problem.score = `${p.score || ''}`;
                problem.docId = p.docId || 0;
                problem.key = `${problem.key}${count++}`;
                return problem;
              }) || category.problems;
          }
          return category;
        }),
      );
    } else {
      setItems([getInitCategory()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue]);

  const addCategory = () => {
    setItems([...items, getInitCategory()]);
  };

  const addProblem = (categoryKey: string) => {
    setItems(
      items.map((v) => {
        if (v.key === categoryKey) {
          const problem: ProblemType = getProblemTemplate();
          problem.key = `${problem.key}${v.problems.length}`;
          return {
            ...v,
            problems: [...v.problems, problem],
          };
        }
        return v;
      }),
    );
  };

  const removeProblem = (categoryKey: string, problemKey: string) => {
    setItems(
      items
        .map((v) => {
          if (v.key === categoryKey) {
            return {
              ...v,
              problems: v.problems.filter((p) => p.key !== problemKey),
            };
          }
          return v;
        })
        .filter((v) => v.problems.length),
    );
  };

  const changeProblem = (categoryKey: string, problemKey: string, info: Partial<ProblemType>) => {
    setItems(
      items.map((v) => {
        if (v.key === categoryKey) {
          return {
            ...v,
            problems: v.problems.map((problem) => {
              if (problem.key === problemKey) {
                if (info.pid !== undefined) {
                  info.pid = info.pid.replace(/[^A-Za-z0-9]/g, '');
                  if (problem.docId && problem.pid !== info.pid) {
                    info.docId = 0;
                  }
                }
                if (info.score === '0') {
                  info.score = '';
                }
                return {
                  ...problem,
                  ...info,
                };
              }
              return problem;
            }),
          };
        }
        return v;
      }),
    );
  };

  const fetchProblemSubmit = (categoryKey: string, problemKey: string, id: string) => {
    fetchProblem?.(id).then((info: Partial<ProblemType>) => {
      changeProblem(
        categoryKey,
        problemKey,
        info || {
          docId: 0,
          pid: '',
        },
      );
    });
  };

  const changeCategory = (categoryKey: string, info: Partial<CategoryType>) => {
    setItems(
      items.map((v) => {
        if (v.key === categoryKey) {
          return {
            ...v,
            ...info,
          };
        }
        return v;
      }),
    );
  };

  return (
    <div
      className="columns defined-problem-category"
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="flex-gap-align-bottom">
        <label style={{ width: 80 }}>题目设置</label>
        <input
          className="textbox"
          type="number"
          value={totalScore}
          placeholder={`输入总分值, 默认值 ${defaultTotalScore}`}
          style={{ width: 200 }}
          min={0}
          onChange={(e) => {
            const current = e.target.value === '0' ? '' : e.target.value;
            setTotalScore(current);
          }}
        />
        {!!totalScore && totalScore !== defaultTotalScore && <label>分值不一致, 题目汇总分值应为: {defaultTotalScore}</label>}
      </div>
      <input name="totalScore" value={defaultTotalScore} readOnly style={{ display: 'none' }} />
      <textarea name="problemCategoryConfig" readOnly value={problemCategoryConfig} style={{ height: '10rem', width: '100%', display: 'none' }} />
      {items.map((v, i) => (
        <div key={v.key}>
          <div className="flex-gap-align-bottom">
            <label style={{ width: 80 }}>第{convertNumberToChinese(i + 1)}组</label>
            <label>
              <div className="flex-gap-align-bottom">
                <select className="select" value={v.name} style={{ width: 180 }} onChange={(e) => changeCategory(v.key, { name: e.target.value })}>
                  {categoryOptions.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
                <label className="checkbox">
                  <input
                    id={`${v.key}-shuffle-${i}`}
                    type="checkbox"
                    className="checkbox"
                    checked={v.shuffle}
                    onChange={(e) => changeCategory(v.key, { shuffle: e.target.checked })}
                  />
                  随机排序
                </label>
              </div>
            </label>
          </div>

          <div>
            {v.problems.map((problem, j) => (
              <div key={problem.key}>
                <div className="flex-gap-align-bottom">
                  <label style={{ width: 80 }}>
                    {i === items.length - 1 && j === 0 && (
                      <div>
                        <button onClick={() => addCategory()}>+</button>
                      </div>
                    )}
                  </label>
                  <label style={{ width: 60 }}>第{j + 1}题</label>
                  <input
                    className="textbox"
                    value={problem.pid}
                    placeholder="请输入题目编号"
                    style={{ width: 160 }}
                    onChange={(e) => changeProblem(v.key, problem.key, { pid: e.target.value })}
                  ></input>
                  <input
                    className="textbox"
                    value={problem.score}
                    placeholder={`该题实际分值${problem.docId ? `, 默认值 ${defaultPerScore}` : ''}`}
                    style={{ width: 200 }}
                    type="number"
                    min={0}
                    onChange={(e) => changeProblem(v.key, problem.key, { score: e.target.value })}
                  ></input>
                  <button disabled={!problem.pid} onClick={() => fetchProblemSubmit(v.key, problem.key, problem.pid)}>
                    确定
                  </button>
                  {!!(i || j) && <button onClick={() => removeProblem(v.key, problem.key)}>移除</button>}
                  {!!problem.docId && <span> ✔ </span>}
                </div>
                {j === v.problems.length - 1 && (
                  <button style={{ marginLeft: 90, marginBottom: 10 }} onClick={() => addProblem(v.key)}>
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConfigProblems;
