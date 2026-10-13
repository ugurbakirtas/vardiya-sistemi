/*
 * TURKMEDYA V62 - FIX2.9 REAL XLSX EXPORT
 * Hosting-only override. app.js / scheduler-v2.js are untouched.
 *
 * Goals:
 * 1) Normal EXCEL button keeps the existing visual layout, but writes a real .xlsx file.
 * 2) ULAŞTIRMA button writes a real .xlsx using the supplied corporate transport template look:
 *    dark-red date/time bands, blue personnel cells, merged time blocks, 24 + 360 logos.
 * 3) No Firebase / scheduler / personnel-auth behavior is changed.
 */
(function (global) {
  'use strict';

  const VERSION = 'V62-FIX2.32-EXCEL-REAL-MERGES-20261012';
  const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // FIX2.12 - Ana Excel sekmesi kullanicinin referans olculerine sabitlenir.
  const MAIN_SHEET_ROW_HEIGHT = 14;
  const MAIN_SHEET_COLUMN_WIDTH = 24.86;
  const MAIN_UNIT_HEADER_COLOR = '#403152';

  const LOGO_24_BASE64 = 'data:image/png;base64,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';
  const LOGO_360_BASE64 = 'data:image/png;base64,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';
  // FIX2.31: Birbirine girmeyen 24 + 360 logo kompoziti; orijinal logolar degistirilmedi.
  const HEADER_LOGO_PAIR_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJwAAAA2CAYAAAAyP/DFAAAfYElEQVR42u2deZwcZZ3wv7+njj6m585kcg1JzEUIIUDQcBrOcOgCHmRFfb3X1fVej/WATbL7WY9dF1ZR3HXF96OosIm64AKCIElQQhACIZBAYiCBkGQymbOn76rn+b1/VM8kHKJAOHx3fv2p6a6u6mequr71u6saxmRMxmRMxmRMxmRMxmRMxmRMxuTPW5YtW2ZU1aiqWbZsmflj64+sW5/k1bQvMnY4X51SB0UAFRE9eNnAjoEWOz7MZbJZzdbfK1Gi3FemurM6MPm4yaWnAzjy8uljjQE3BpoAIiJu5L3eYu8UwtThUolPFuM1ajU6JRquTK30FZ06J4rg50IybTm8tL/ReGajqusPw/D2wccGd04+fHLvwfAdPPYYcP+7YRuF4Yl1T2Qajml6PZhzq3sGz6vtL05yTxYaio/1UalUyT/Rx/COAeLIYoFwfJbcjA5SjRmy4xppnt9J2JIaaJzcts343i8Rd0NLQ8uGg6DmldB2Y8C9ymDbdtO2VPsZEy+Ii5V3Vx7tW1zd1NPQt+4xBh/aQ2WwaKv5CmoQNYLzBKtgUSJVYuuIrMX6Rk1LShq6WkzXiTPoOnEmbbPG9+bGN/8iKtauam9vX/dKabsx4F4dJhQR0YGBgWNd2lxSemjfBUO3bDU9tz5MeVe/VauCb0R8k4Cm4FSJUZxCDFhRYiBCiZxSi2LKtqZlW1a/OWDKcTPM0UtPYuoJswbCbPjDnj09X545c2bPyw3dGHCvEtj6y4MftQPV5UM3PtL+xPfXUd094Ezgix/4ggHqkDkUR6LVrIJ1CXgxEKNEQATEOCJ11CSmHFcoVUtqA6fz3nCcWfzB8xg/Z/LGwe7+L3VN77qpHlS8LAHFGHCvIGz1Ayy95aEvS3f589sv+R8G1253fjowfuhjAJyOHiWnjMLmUGJVLGDVUdMR4BLoYlVqqkRYqlKjJhEVW2W4MKyp9oz+5dc+aOaddWxULpQ+3tHR8e8vl19nXgJ4xwO3Jeckrv78Skwj/3svcNar6QSrw8a2m7al+ivD/+E9mv/8wx+4xubXPuqyzVmTTgWEQIAQiiGkPhlDaITU6HsegQi+GAIj+AgBybMvQmAED4OvPp7z8I1PrqlRqvmKueoj/2p/fdUNQaYh+519+/Z9vg6aean33R/TNa+MGdVlKgOnDn/HPtDz3oc+vtLa7mGTacmKcQ4PQZ4lX+sBRgUnIEmKLjmHpH6GSWJ2vfrZZgBPBE89PDyMGkQhlUrjrHqr/vH/amEozwWffPtXuru7e0Xke6rqiYj9c9BwY/InWgIR0d4vDH/WbR9476aPXGvtvoJJNabFcw5PBdEEKKOCcQcmUcEgGAVPwDfgi8FTwUPwpQ6YJMuNSDJPouk8PAwGceAbn0w6I7+4/Br9n2+v1Gxjw+W7du09TUTsypUrvTHg/j9KfQwMD5xGb2nF1uU32rhn2KRyKfGd4onBmAQ4EyvGCgaDEYNRwXOCOEah8xF8wBfBH50XjFWMU8QqOMVIfRwkGUsSlWiMIZ3JmOuvuEYfuXNTrnVc03e23betY+nSpXZEE9fLat6fNXBJKj2ZjIAxyeQZ+SNTfd3650T+rKIeEdCHVq4MnWe+vv/q+1IDdz0mqcaMiHUYz6C1GFeMMGowqRAjBooxFGIMBhxIXQMaSJ4lAVBEEAOiSpBNETSkCRtSpBvTyXKk/kx9LnkEYUi1WDFXfOIrtjxYnDNu+rh/rB8iT1VlxYoVbsTEHgrwDqkPpyC5BqRU+kNn+Oh69T9PfX3QixcetTwLgcYgsUVeSThXr17tnSYSH6bFD0QP9B776FW/senmjId1eIGHG66QmtTCuP+ziIZjpoKziDFUt/Uy+P27qWzZh2lO4dQl36OM7LMgonjGUBkocdh7T2LK2xdRGygStmV58Ad38uCP7sJkPcQdAM0zBhdZisU80+bNYNrC2WZocFCbO1rfv2fPnqO7u7vViHj79u27S0Ru6ejouFlEbB0690KjWf/FmYjkhFmzfLHZP2+tylIsReLnIifwhEzK0JT1aMwamrMejWlDOmVIB4LvJZNnDkAaWSW2ULOOStVRrCj5kh2dihWlErmnwXtgM60lFtBlyzDL512UjLx5lcoK3MtkSgWwO1avTlfy5b/d+b3fqitHIi0hRg2uFJGd08lrrryYcGobWrOIEVAlvXAKjecezp6/+RmFOx6FlhSCGwkXEBRjDLZQoXn+FGZ+8gyCXAYvNZGh7T08fvOD+Cmfmo7aFoxniIpVUk0ZzvvcUl73psU0NOekVqmC4jc2Ni6qbzeCvDaKo48PDAzc3d/f/zkRueNpaZ2XFjhVhFUXGTp6RGRtHa61rr7MfOz85qZf/q4cNDZ4TOsMeU1nyGEdIZPaAjpbfNoafXJpQyYUfM8QeCSQGcHzEkdX5KmaSl096ekgdop1ShQrkYVapBSrjsGCZX8+Yu9AzK79ETv2VXlsX42eocgb3+w13rlqeihHbqmtYNWBcVde5NHRI6xZ615K+FatWmWWLl1qh7RyZnXzvhm7bnlI07m0UaeoOiT06FrxRlLT2on7S5h0gC1FSMqDcoRpSjHhsgvYeeFVxH0FSJt6jKr1Y+KQwDDzc+cQtuaIh8q4KObuS35Oef8wpjENcVzX9oZasUrX0TN405ffw6S5h1EplImiGl7oE5VrlIolh4L4QpAK1Dkn6XR6EbB2z549/zJx4sTPA6Kqz1vTyfMFTZauGg2ZdfVin3x+WuziqepknufLgih2R5Zrbl5D2msIfJNoHAP4Qj2MSv6rBWKFqqNcc1QjpRYnIFmXwKUkPopnBN8XAg9SgSEbCiZl6mOaxJkZGS9OHOWRROlw0VrP47FcymyyysZY7UOpwNtJxE550wODT4HvJdJ6I6mGYa2u3HPFurfe/4/X28bxTX7gwC9bWo+ewtyf/jW2EmEaQvqvvof+/1xP8xvn0fKhE4kLVaQxzb5PX0/xpoegKYXFJglHXygPlel8/0m85pLziPpLpNob2PLt2/ndl29AmtJUraOqlqqpUagUaJ7RzsXf+yhNnS1Ui2W8VMDA1n3s+u12nlizFTVQq9VonNzqpp9zBFNeO0OyTVm1kaWtvc08suH3/3bkormfeiFlMf9PAU0EFUFhldWVR4RxJjhRVRZHg4PHIswLfG8GGQORkvKFVOglUPkJz8Vhy+7eGjt7I3b3RnQPRPTlLQPFmKGSo1i2FKtKNVaiyBE5cDY5f40hSWr6QhgImdDQmBIasx7NDT7jGj06mgMmtQdM7QjoGuczrjUEH0wMzTnPQ5iFkVleIG/xnEdctn2obol+Pn+jYH7rhdEd8sZV3U9zFUj2+ZBEplZV2/b37F/45F3bxKR9o86hGNSAdbD/mnvQ2CKBT9+//4baln3E+wtw7hFJkX6oSrUtDZ7gREfPxrhUI3vkZLo+tBhbqBLkUvT+7jG2fPt2/GxIjCaaUBQbW8KGFOdcupTmCa1UCiU832fTf/yWLdfcQ6EnjxpHrBaHY/emnebh2zYyYeFheuYX3izjD5/Irsf2xMP9tU9suveRdSKyauXKld7SpUvti9ZwI6CNzFevXzDPd/q2WHSJQWb7aa8FEbTiiK06z2CMESKrrjcf88DOsln3cIkHd5bZ1WvpL8QMFh35ksVa9yzOljw1/HiekkkZWrMeLY0eE9tCjuhKcfycLMfOyOhhHaGmAzFGku0TMH7KgA9RwcZ4PAp6tyDX+NX4dlm6pZYkZzEvVuONaIF+HT4qfmz4gdvOvcIFKib0hABDiBCo4Nt6whcQ3yNozhKcOZf4jDkUB0qUrSN77T2kNu7GppMT2qojBmZecTEtp8zAFWqob7j7Cz+je+0jVGJLuVzFhT41YgYLQ8z7y9fxhq9eTLm/SNiYZsM3bue+K9YgWR98wWGx4nDqcOKwzlIaLjFu9nj3F//6Xmoa0NKaM6lG7+Eg8I9vb28ffj4lMf+PwVb92dELjKcfU6cXGc80hb5ArNRK1oqIDQIJfcVEVneGRm/dvLu67sIVOz60uz9aFNuD46k/IcY9OKtuEgitU4xAGAaoKtbaZ0S+TpVyVSlXHXsGHFueqPDrjfCtG6A54/V++PxxX//y+yYEUcm92QhHeIFJR1VrtYLzjASeL3OAOVHk3hGn/N9Gv1jwb74/8Zdy3s3VQwEdQJpU07Ad0tg5PAxWBU+SAryIIKmkdmrEwxUrpA7vZNJnzyDKl9m/N2Bg7VbSW7txYVLJd0ao5WtM/MhiWl4/k3i4QpAK2PngHvyFM1h44bFUd/fzyM/uZdfGnbgM4Cnzzl+IrVn8bMi++57goR+uxzQEqK/ENkZx2Prk6uClWjLs3fqkWfOtm+yFX3m35wfG5nINc/P5/GtF5Nf1yNW+YOBEUL16ZlOUzXzU+Pq3nm/aNVZiq6hVh4JvxDOeeHHs7hP0RxHhtanzN+wFmoF3jIzV3NTIrFmzaG1ro1KpEEXRU1IkB2kCoiiiXC4zODjIvn37UFXa2tooFotUqtXnTHAlwCb7nGvIYjxP8/lhGSxZ+5Vr993zlWv3rb7pGzO/fu70hnOjyL5bkDcEgQmiSJ2rKShijHieJ4vjWBfH1e6Vlevm/71c+ODWQ1FjVlg4vL1Popp1ftrDKNjRXKJirEtmPIeqQsoj05QiBeTasnR25ujrHqbv+gegIaQ2XCGzoIuJ7z0JV44IQp+BfXl6dufpOGoK4yY3kztlJl2nz2X9Fb/inp+sIdORo2lCC7YWEzal2PGrhyn1FwjbM8RxYkadOBwOVZsEaupwscPPhOy6d5txUU1NOouI4Pv+ecCvX7QPp/+9oCUW/ZcgMB/QWImqzonUk8SKeAZRo5XY8q2qDS7LvWXD3pEoNZcjXSoyql8VwQ9CZs2azeLFi5kyZUryhT611kMqlSIMQ7LZLNdffz2f+9znsNZy8cUXc/7557NhwwbWrVvHb37zG4aGhp6h5To6OjjjjDNYtGgR8+bN48orr+S6667D8wzggvgSjHxiew24TlcvvsEODy2Nnfuy75upsVWLgFPURcnGBWlZSlXm6HVHvVcu3HT/i09268z8lh5qlZhUNsRaR+ySgEckCa5G0zoCcblG5clB/JYsokKmo5HJl55HuWeIgTsfg4aQrk+djt+cxhVrxOLx6N07oWrxihXCVCsudqTbGjh9+Zvo2d1NqVqkaVIrcSXC1hylgQLOkOT2RsyoJtpN0QRAHNY5VKBcKrH3kSd15olzxcYWa+1pz9cHevagQdxfeYH3gThWpxZGYFNQEcR4QhzpN/03PfD5QFBdvdhfeuVaFcE+/Z/n83nWr1/P+vXrueaaa2hoaBgFTkRQVSZNmsRll13GwoULAZg2bdro5zs7O1myZAlLliyhr6+Pd73rXdx0003P2OSLLrqIyy+/nDAMAbjmmmtGD7W1qKzALQOzfPVib/matW7FCn5S/vmCXvHdfwWh15LYtgNfn6sqfqO/IC7ElwOnHpJgFSGWpIUoEYeqJM1GRnAI1jpM6DHwwC4K77iKllNmM+Wjp+JlQ7xcyMSPns7uW7Yw+S+PpW3xbGr9JYJcyNYfr+fx/1iLqGOnETpPeA3HfvQsGsY3YVI+p332Am674ufYKDmgAglMxMT4xNgDgHEAPqcu8enq2k+80XQenucdmjxcZPmiQVVdUnY72M3yQ8E59vrOfA8BXY0vp62N/5CvlsvlmDhxInPmzGHRokV0dnY+BTjnHJlMBhHhrrvuor+/n5/+9Kejvtptt93G7Nmz6erqYty4cXzqU5/ibW97G8aYJDEpQhzHdHV1sXfvXqIoYuPGjdx7772jpnpEVoCuOG1trIosn4cnb37gV7WfHXWT+LrEWbUH74MCFKzDMePQVGFka+O8DjQ0ErmR/JmAUVTBViyBJ/i+hxElrtao7q0x9J9r0WzAjL87m7hQoWHeRJrPnEPryTPBOvxMwOAje9ny9ZuJyjViI0SibPrhOqo1y9mXv51qscr42ZPxMyn6dvYwfuZETOiRGZcjdjHGJL6x44CGS5o9R/BTIhuRasowYfZksbXYZbJpjDG/fr7ptWfXcB49nictquoOrrdqclLiHGmbNk0hqK5ZDKx9holUVVpbW/na177G2WefzYQJE7j//vv5yU9+gnPuGTDccsst3HXXXezYseMpY91xxx3ccccdNDU1ccoppzBr1izCMByFbWScTCbDwoUL6e/vJ5VK0dDQ8Fw+n2rSnS2VHJdQ028QeDZ45qmH8YJDUPGDAO5rnNGuGhisVaQeFLlqTBD4NE9vxw5XqQ6WMKbeFRIK2pJizy2bmPzu4wmbs3jpgNyCLnJzJ2IrEV4mYNevNlPMl/GaUlirOAHTlObxe3/P4K4+GjubSGUC2qZ20Pt4N5PmHUZUrDLr3PlsWrWeSqWcRKjWceBR998E8IRKvqwLLjjeNbQ0ebVKFess1Wr1l4dEw4nIFyz8wPclF8VqSRoOxAgSxapBKK1RFF86/LOjPihvWdsDsHIl5qLNqKw4AFxzczPnnHMOXV1dqCo7d+7kjjvuwDn3FA3lnGP37t309fUlEVv9vRF4jTHk83luvPHGP7gj5557LkuWLGH69OlMnz6dG264gfXr149C+WzQAXD2ph3Ajpe6vFVFC3gisQc4h2qSljni7SfTOnM8E0+ZxfYfrefhy35FblIzceTwFKKqJcyk8EMf1UQb1moRcbmGGIOoELRkqUYxAWliccQC1biK8dOE6bDeiqqUCkW2/+IRjjn/REqDBTrnd7Hw/a9nzWX/A1aQlEEPisfVgHOO4mCBCUcc5k7/8F+Ic841ZBu8crn80IQJE+6tl+3ciwLOv2/TddFRR35JffMPQco0R1V1qmoR8RAkjlR9IxcgNNZ+cfQ/BJWNv5WlSYh42Lis1z1UkRioVCrceOONTJ06lTAMmTp1Kt/97nefAYGqks/n2bx5M7feeitr1qyhUCiMLrPWIiJ4nvcHAVqzZg0LFixg/vz5nHzyyWzfvv2g6PU51M8yDPMuek6TcHB15YVKjnBXqcH//aTjps3aueYR19DcaKJChclLjmDyiTOxNcthFxzDEzdvIr99P37og3N46YDpf3UKQUuWuBwRDZXY+avNZKaNo3XuJKJCjannzOeR6zfw5L07caEQ2YiaWE5+1+vJdTZTGS5Tq8Rsv3cLWzdu4aG19zP3xPmU8kWOfdfrMWmPe358B/t37kXRujenWBfjZQM94sxj3Nmfeqtpn9yhLnYulhhr7TIRGT5kiV+A6PpjzhHs5zyR0wgNUckpog4VI4L4gRBFtuR58vPIumtSnbn1cuL6GrAKOKfeiCrGJNGqiDkIGB1NjYxosZFlURSNargXacoE6M6mvPcUP29vlRWj7ecvd6eIf9ppp8Vlrf34vm/dfvEvl/2Xbe1s9+OBKvMvPoGzvn4x5f4CQUOKoe09bP3hOvo27aKhs5lZb19E54kzcZEl097A9p9t4Lb3f59pFxzDkqveR3W4ggk8SnsH2Xj1ney8eytBS5r5S0/g8CXHYKOYXFsDD95+P994zzLKUYVxMyby8e9+iQnTJlEcLhKkQ3of7WbXhkfZunoT+f2DWLHa9dqZbsbrDjfTj5ujqWwajS0tra2mv7//Xzs7Oz/zQkpbf9TZ6716ZlNjLrPU9+Tt1sqpQcYItXpOLulqFj9tJK46xMidfUPRg5dcvfeMtZuLs7btrh6SNqODsyjyLHG4PAtFxohObg+kfyjaU6zpUuDOV6o1aUQLFLSwpH/z/lu+d8FXNSCQQDxMJJz9zxdz1NLXURwoYQIP1SQtYgIPPx1gyxGZtizd9z3Br/7q+1TyZaKaZeEnlnDC3y6hnK+MNgdGpSrG9wgyIXG5Rralgb5dPVz2zr/nie07MNmAYqnIlCOn895/+AhzF86jOFxEUYJUSLVYwcXWIUKQCdXzPaJKzTRkG8Sp02q1+s/t7e1fGgmzD2nxfuVKvKV1U6krFzaTihbGzpyj4t5oxMz1TH0EV29lCQwYKBcsu/siHu+N2L67ysNPVti2u8Kj3TX29McUyoe+Zb4xYzh+TgOzJqfoy1t+t63IKUfmWDy/ofS6WdlVh09Or/J9t443PDh4qOqkz7M9iVWrVgVnnnvW/bd8ceXce3+yVpvHtRoTATU4a9lbWfCOkxDPQ50bbU9SBS/w2HH7w6z+/ErKvcOYlE+sSrVQ5ti/PpVTPvMXBKGPsw7xTPI5l3zu8U2/58oPf5UndzxOkAupuRjrKaVKGS/tc9HH38npbz6H1nFtVIplFCWdSSd+tE3SFLUoQkTWO+c+fdBF1C+oPUn++JeFsGaxV099ANC/cmFza7YyL3LemTg5EdxsUdOuSmMQihDUu0IAakpcdZRqjnJNKVYs/cOWfQMx3UMRvflkPl+2lGqOasVRjRVrFeMJxYpj7YPDxA6OP7yBE+Y20JoxtDX5dDQHTGjxuW3jMD+6vZ9zjmviE+d3MHtKmu7+iBt+N8T6bcWBsxc2Xn3R69tcFMWHg3eXjaMfZ968+dFXxqxWP9C7efd/fvMNy61vfM/3AzwnuLJl6nGzmPuGY5l0zGuwtZgg9Bnc3c/2Xz7Ajts2E0cWL+0TO4tKkrYoDxeZcMxhzDn7aKadMBeNYyTwGdo/wIYbf8uGW+8inx/CbwgS2MQSYXEGqnGN4WKerjnTmX30XH3bB97J5OmHxZVyeZMx9T5hI7d5nremvb395oO6fl9wA+bza0+qp86esWz1ghaGZQEqRw2VovmbHi+/MfDMxI5mn44mn6acD2mpF0j1oIv4lKd6VfpU22iEuGhZ9Jnfc9+jJc5YkOPHn5lG56QwqWLVUwukhJ1bS1z64708/ESVt57UzIUnNGNE2L63MmyFL5y/fMe38yuP7mgMbRu1gSdk6ZPll9u0qqqsWb7GO+6Lr12z5rJfnHTj1/7LNY9rM0YFz3jEhSrG+KSzaXBgxOBiS1Sukcqlk+TwCGyaOPZqoFwoEicOPrGLicVRszWKhQJ+LkB9oeZinDhiLBZHRIwVB77Q29/HuAnj4mtWX+d7YXh5W0vLp+sXR4+CVdfS5sVe0fWCuq41Kf/BcoTlI61LB9Wp4fq2Rn/JhFZfO1t8aW/0Gdfk09Hk0dbk09rg0dLgkcsYGjMeDSlDKjSkgqTT1zeCqW9ZEBq++IM9XHljcgOgD583jvef1U6hYilUku6TvrylEjl29kRce8cAffmYKeNCVVS6+6O91vFuVW57Oc3oc3WODA4OHlculNf+6KPfymxft1lzjY0GC57vYVTqX3CSi0ME8QxqXb3RKHk4TeatutGWothaYiyRxkmc6UGsMXG98yPCYcViNakvOFGqLgIP+y9XfdM79qTXbtq+bftpRx555EA9ZaV18ORQXTooh+aLRNYsxzv11MUc/q7fjd/2ZPlqVU4/KFJ8atrFE1KBEPrJdKCtXOoNl/UOCkm6WgcLlu6BeLRFva3RI7ZKzUItSpo3n9ppIlg32qnSDbwLuHXZMsxy4OVqLX8u6Ipx+SN7Nz/xre+8+6t2qLvPZBsaRG1y5dYobPXrD0Z7e+u3elD0KdVOi8PWe9hiddiRFiOSspTFEdfXi+vAOVEijSkUCu6Tyz9rlr7/nfk9u3efN3PmzDufb6rjZQduTJ53ACEi4vKl/Df3PPD4x6780Fft4N4+09CYE7V6EHAjFzyPeBpPg60OoFV7oBIq9fcOgi2B0tahs2jdf6tUy+59n/yQeeffvC8ul0rvmDhx4sqXErYx4F5h6Dav2ux3vXHqFft/v+eD3/7IV92uLTtobG4yUvdxn5EgR5NqQ13jHdBxWm8rqt/sRg4CTu3oOlYSIEvVMqD2Y5d+2jv/7W/RWrX6kY6Oju+81FfdjwH3ykOHiGixWv6n/if3f/HqS7/DhlvXO9/3JEyFciCgUvSg/GOCVb3LRKjjBE6SmxMm0FmsHujycAKRjSmWS9o2vl3/7quXmpPOfP3QYP/AJyZNmvSDl+sOSmPAvUqgK1TL7y/0DV1y383rpv33ldeyb9de53meBGEgIia5SZcyalKBg8yrjmo5Va2b1QNarRbXqFSrGoSBnv3mN5h3/PV7mDKta3V/f/+XpkyZctfLeY+4MeBeRT5dT0/PrExjw6WPb97+lo2/vie77pdr2LX9cRfXYvzAF8/3RDwzak7hgHbT+ivFETtLzUZaiyNiF2vzuFZZeMLr5Nw3v5F5xx21u7Gx8aoNt2z4+skXnjw8dkPC/73geSJiLwLvh1F0Zq1aet/ubbuWbN2wueXhDQ/y8H2byQ8MaX5oyNVTFiJG6iZVcc4mqREXayqTJtuU87pmTOWY4xdy9KJjmXHE7N2tbW3/vb+n53tdXV0PHBwxv5z7OQbcqwu6UQBWr17tn3TqSYtszZ7b2917Vu/enll9e3pan/j941QrFYYGB+nZu49ivoAX+rSOb6etYxxhymfiYVOYOG2yju8c39s5ZdK94nGbxnpzU1PTlqeb8pd7H8eAexWb2JH3hoeHx+dyucOK5eJparUjdvGkSrFyfLlYaqpWqipGJNeUI53J7A5Swd0Gkw8z4dbQC9f39PQ83tnZWfhDY4/JmIyC94d+eWblypXe/v37J5XL5WmqOlVVpw4MDEzbtm1bxx/SnAf9OMgrKmMa7s9I640etOfWUPK0nzt6xX99ZkzGZEzGZEzGZEzGZEzGZEzG5E+W/wehFQvvOAyGrgAAAABJRU5ErkJggg==';

  let excelJsPromise = null;

  function toast(message, type) {
    try {
      if (typeof showToast === 'function') showToast(message, type || 'info');
      else console.log('[FIX2.9]', message);
    } catch (_) {
      console.log('[FIX2.9]', message);
    }
  }

  function ensureExcelJS() {
    if (global.ExcelJS && global.ExcelJS.Workbook) return Promise.resolve(global.ExcelJS);
    if (excelJsPromise) return excelJsPromise;

    excelJsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-tm-exceljs="fix2-9"]');
      if (existing) {
        existing.addEventListener('load', () => {
          if (global.ExcelJS && global.ExcelJS.Workbook) resolve(global.ExcelJS);
          else reject(new Error('ExcelJS yüklendi ancak Workbook bulunamadı.'));
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('ExcelJS indirilemedi.')), { once: true });
        return;
      }

      const s = document.createElement('script');
      s.src = EXCELJS_URL;
      s.async = true;
      s.dataset.tmExceljs = 'fix2-9';
      s.onload = () => {
        if (global.ExcelJS && global.ExcelJS.Workbook) resolve(global.ExcelJS);
        else reject(new Error('ExcelJS yüklendi ancak Workbook bulunamadı.'));
      };
      s.onerror = () => reject(new Error('ExcelJS indirilemedi. İnternet/CDN erişimini kontrol edin.'));
      document.head.appendChild(s);
    }).catch((err) => {
      excelJsPromise = null;
      throw err;
    });

    return excelJsPromise;
  }

  function rgb(hex, fallback) {
    const v = String(hex || fallback || '#FFFFFF').trim().replace('#', '');
    const six = /^[0-9a-fA-F]{6}$/.test(v) ? v : String(fallback || '#FFFFFF').replace('#', '');
    return ('FF' + six).toUpperCase();
  }

  function fill(hex) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb: rgb(hex) } };
  }

  function border(style) {
    const side = { style: style || 'thin', color: { argb: 'FF000000' } };
    return { top: side, left: side, bottom: side, right: side };
  }

  function setCellStyle(cell, opt) {
    const o = opt || {};
    if (o.fill) cell.fill = fill(o.fill);
    if (o.font) cell.font = o.font;
    if (o.alignment) cell.alignment = o.alignment;
    if (o.border) cell.border = o.border;
    if (o.numFmt) cell.numFmt = o.numFmt;
  }

  function downloadBuffer(buffer, fileName) {
    const blob = new Blob([buffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function safeMondayKey() {
    return getDateKey(currentMonday);
  }

  const TR_MONTHS = [
    'OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
    'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'
  ];

  function weekWorkbookNames() {
    const start = new Date(currentMonday);
    const end = new Date(currentMonday);
    end.setDate(end.getDate() + 6);

    const day = (d) => String(d.getDate()).padStart(2, '0');
    const month = (d) => TR_MONTHS[d.getMonth()];
    const range = `${day(start)} ${month(start)} - ${day(end)} ${month(end)}`;

    return {
      range,
      fileName: `${range} HAFTASI TEKNİK EKİP CALIŞMA LİSTESİ.xlsx`,
      scheduleSheet: `${range} HAFTASI`,
      // Reference workbook uses two spaces before ULAŞTIRMA; preserve it.
      transportSheet: `${range}  ULAŞTIRMA`
    };
  }


  // FIX2.11 - supplied weekly workbook is the visual source of truth for
  // unit ordering and person background colors. Transport layout is unchanged.
  const UNIT_EXPORT_ORDER = [
    { aliases: ['SİSTEM SORUMLULARI'], label: 'SİSTEM SORUMLULARI' },
    { aliases: ['TEKNİK YÖNETMEN', 'TEKNİK YÖNETMENLER', '24TV - 360TV TEKNİK YÖNETMENLER'], label: '24TV - 360TV TEKNİK YÖNETMENLER' },
    { aliases: ['SES', 'SES OPERATÖRÜ', '24TV - 360TV SES OPERATÖRÜ'], label: '24TV - 360TV SES OPERATÖRÜ' },
    { aliases: ['PLAYOUT', 'PLAYOUT OPERATÖRÜ', '24 PLAYOUT OPERATÖRÜ', '360TV PLAYOUT'], label: '24 PLAYOUT OPERATÖRÜ' },
    { aliases: ['KJ', 'KJ OPERATÖRÜ', '24 KJ OPERATÖRÜ', '360TV KJ'], label: '24 KJ OPERATÖRÜ' },
    { aliases: ['INGEST', 'INGEST OPERATÖRÜ', '24TV - 360TV INGEST OPERATÖRÜ'], label: '24TV - 360TV INGEST OPERATÖRÜ' },
    { aliases: ['UPLİNK', 'UPLINK', '24TV - 360TV UPLINK'], label: '24TV - 360TV UPLINK' },
    { aliases: ['24TV - 360TV BİLGİ İŞLEM', 'BİLGİ İŞLEM'], label: '24TV - 360TV BİLGİ İŞLEM' },
    { aliases: ['24TV - 360TV YAYIN SİSTEMLERİ', 'YAYIN SİSTEMLERİ'], label: '24TV - 360TV YAYIN SİSTEMLERİ' },
    { aliases: ['24TV - 360TV IŞIK', 'IŞIK'], label: '24TV - 360TV IŞIK' },
    { aliases: ['24TV - 360TV DEKOR', 'DEKOR'], label: '24TV - 360TV DEKOR' },
    { aliases: ['24 TV - 360 TV KAMERAMANLAR', 'KAMERAMAN', 'KAMERAMANLAR'], label: '24 TV - 360 TV KAMERAMANLAR' },
    { aliases: ['24 TV REKLAM AKIŞ', 'REKLAM AKIŞ'], label: '24 TV REKLAM AKIŞ' },
    { aliases: ['24TV YAYIN YÖNETMENİ', 'YAYIN YÖNETMENİ'], label: '24TV YAYIN YÖNETMENİ' },
    { aliases: ['24TV MCR OPERATÖRÜ', '24 MCR', '24TV MCR'], label: '24TV MCR OPERATÖRÜ' },
    { aliases: ['360TV MCR OPERATÖRÜ', '360 MCR', '360TV MCR'], label: '360TV MCR OPERATÖRÜ' },
    { aliases: ['RESİM SEÇİCİ', '360TV RESİM SEÇİCİ'], label: '360TV RESİM SEÇİCİ' },
    { aliases: ['GAZETE ARŞİV', 'GAZETE ARŞİVİ'], label: 'GAZETE ARŞİV' },
    { aliases: ['RENK AYRIMI'], label: 'RENK AYRIMI' },
    { aliases: ['TV ARŞİV', 'TV ARŞİVİ'], label: 'TV ARŞİV' },
    { aliases: ['360TV PLAYOUT VE KJ OPERATÖRÜ', '360TV PLAYOUT  VE KJ OPERATÖRÜ'], label: '360TV PLAYOUT  VE KJ OPERATÖRÜ' }
  ];

  const PERSON_COLOR_ENTRIES = [
    ["ABDULLAH BABUN", '#F4B183'],
    ["AHMET ORKUN GÜMÜŞ", '#92D050'],
    ["AHMET ORKUN GÜMÜŞ  ***", '#92D050'],
    ["AKİF KOÇ", '#4472C4'],
    ["ALTUN BAYRAM", '#4472C4'],
    ["ANIL RİŞVAN", '#8FAADC'],
    ["APTULLAH ÖZÇİVİT", '#C9C9C9'],
    ["AYŞE HALAK", '#4AFCCD'],
    ["BARIŞ İNCE", '#A6A6A6'],
    ["BEKİR KAYALI", '#70AD47'],
    ["BERKE GÜROL", '#F8CBAD'],
    ["BEYHAN KARAKAŞ", '#92D050'],
    ["BEYHAN KARAKAŞ- AKİF KOÇ", '#92D050'],
    ["BURAK BAYAR", '#333F50'],
    ["BUSE KURT", '#92D050'],
    ["CAN ŞENTUNALI", '#93C47D'],
    ["CEMREHAN SUBAŞI", '#FFE699'],
    ["CEREN GÖRAL", '#FFFF00'],
    ["DEMET CENGİZ", '#70AD47'],
    ["DİLEK AYDINDAĞ", '#00B0F0'],
    ["DİLEK AYDINDAĞ (09:00-18:00)", '#00B0F0'],
    ["DOĞUŞ MALGIL", '#FFC000'],
    ["DUYGU YUCA", '#FFC7CE'],
    ["EKREM FİDAN", '#4F81BD'],
    ["EMRAH ŞEKER", '#FFC000'],
    ["EMRE TAKMAZ", '#BDD7EE'],
    ["EMRULLAH AHLATÇI", '#009110'],
    ["ENDER GİRGİÇ", '#F4B183'],
    ["ENES KALE", '#FFFF00'],
    ["ENGİN DEMİR", '#E2EFDA'],
    ["ERCAN AYBASTI", '#FF0000'],
    ["ERCAN PALABIYIK", '#8FAADC'],
    ["ERCÜMENT SAMİ YAĞCI", '#FFFF00'],
    ["ERDOĞAN KÜÇÜKKAYA", '#0070C0'],
    ["EREN KAZAN", '#B9CDE5'],
    ["EREN ÇAKAN", '#A5A5A5'],
    ["EREN ÇAKAN  ***", '#A5A5A5'],
    ["ERSAN TİLBE", '#FF0000'],
    ["ESRA AYDIN", '#FFCCFF'],
    ["FARUK YILMAZ", '#F4B183'],
    ["FATİH AYBEK", '#FFFF00'],
    ["FATİH KOÇOĞLU", '#A9CE91'],
    ["FATİH UĞUR YÜKSEL", '#F4B183'],
    ["FATMANUR CANDAN", '#7030A0'],
    ["FERDİ TOPUZ", '#FD6DF3'],
    ["FERDİ TOPUZ - AKİF KOÇ", '#FD6DF3'],
    ["GÖKHAN BAĞIŞ", '#FFD966'],
    ["GÖKHAN HACIOSMANOĞLU", '#773F19'],
    ["HAKAN ELİPEK", '#C4BD97'],
    ["HAMİ ÖZCAN", '#F4B183'],
    ["HASAN CAN SAĞLAM", '#000000'],
    ["HAYRUNNİSA UYAR", '#FFE9A3'],
    ["İBRAHİM SERİNSÖZ", '#DAE3F3'],
    ["İLKNUR DEĞİRMENCİ", '#FF66CC'],
    ["KAAN KÖPÜR", '#F4B183'],
    ["KADİR YILMAZ", '#FFC000'],
    ["KADİR ÇAÇAN", '#FFC000'],
    ["KIYMET KAYA", '#FF6699'],
    ["KİRALIK", '#FF0000'],
    ["MEHMET BERKMAN", '#FFFF00'],
    ["MEHMET BORA AKCA", '#63069C'],
    ["MEHMET GÜR", '#8FAADC'],
    ["MEHMET TURGUT YERLİ", '#FFFF00'],
    ["MUHARREM ULU", '#3D4C5F'],
    ["MUSAB YAKUB DEMİRBAŞ", '#00B0F0'],
    ["MUSTAFA ERCÜMENT KILIÇ", '#00B0F0'],
    ["NAZIM TÜNEY", '#DEEBF7'],
    ["NECDET DEMİRÖNAL", '#A9CE91'],
    ["NECDET DEMİRÖNAL ***", '#A9CE91'],
    ["NEHİR KAYGUSUZ", '#FFD966'],
    ["OKAN ÖZDEMİR", '#FFFF00'],
    ["OSMAN DİNÇER", '#92D050'],
    ["OĞUZHAN YALAZAN", '#FFC000'],
    ["PINAR ÖZENÇ", '#F8CBAD'],
    ["RABİA NUR DEMİRCi", '#FFFF00'],
    ["RAMAZAN KOÇAK", '#FFFF00'],
    ["RECEP KAZAK", '#009999'],
    ["RECEP KAZAK ***", '#009999'],
    ["RECEP KAZAK ---", '#009999'],
    ["SEDA KAYA", '#558ED5'],
    ["SENA BAYDAR", '#D99694'],
    ["SENA MİNARECİ", '#F9BDF6'],
    ["SERKAN DURSUN", '#C6DEB5'],
    ["SERKAN TOZLU", '#F1F0F0'],
    ["SERVET BULUT", '#FFC000'],
    ["SEYYİD YUSUF ALPKILIÇ", '#C6DEB5'],
    ["SİNAN GENCAL", '#941BB5'],
    ["ULVİ MUTLUBAŞ", '#ED7D31'],
    ["UĞUR AKBABA", '#FFC000'],
    ["UĞUR BAKIRTAŞ", '#92D050'],
    ["VOLKAN DEMİRBAŞ", '#0070C0'],
    ["YAŞAR BAYNAL", '#F5F5F5'],
    ["YAŞAR DEMİRCİ", '#000066'],
    ["YEŞİM KİREÇ", '#B25E25'],
    ["YİĞİT TOLGA DAYI", '#F4B183'],
    ["YUNUS EMRE YAYLA", '#C5D9F1'],
    ["YUSUF ALPKILIÇ", '#C6DEB5'],
    ["YUSUF HENEK", '#B9CDE5'],
    ["YUSUF İSLAM TORUN", '#A5A5A5'],
    ["ZAFER AKAR", '#E46C0A'],
    ["ÖMER FARUK SEÇİLMİŞ", '#00B0F0'],
    ["ÖMER FARUK SEÇİLMİŞ***", '#00B0F0'],
    ["ÖMER FARUK ÖZBEY", '#FFFF00'],
    ["ÖZKAN KAYA", '#92D050'],
  ];

  const PERSON_FALLBACK_PALETTE = [
    '#92D050', '#FFFF00', '#FFC000', '#93C47D', '#C5D9F1', '#A6A6A6',
    '#4F81BD', '#FF0000', '#8FAADC', '#E46C0A', '#0070C0', '#F9BDF6',
    '#FFD966', '#F8CBAD', '#70AD47', '#DAE3F3', '#C6DEB5', '#A5A5A5',
    '#F4B183', '#B9CDE5', '#FFE699', '#D99694', '#00B0F0', '#BDD7EE'
  ];

  function normalizeExportText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
  }

  function exportUnitFamily(value) {
    const key = normalizeExportText(value);
    if (!key) return '';
    for (const spec of UNIT_EXPORT_ORDER) {
      const names = [...spec.aliases, spec.label].map(normalizeExportText);
      if (names.includes(key)) return normalizeExportText(spec.label);
    }
    return key;
  }

  function sameExportUnit(a, b) {
    return exportUnitFamily(a) === exportUnitFamily(b);
  }

  function effectiveUnitForExport(person, dayIndex, shiftValue) {
    if (!person) return '';
    const offValues = [
      SHIFTS.IZIN, SHIFTS.BOS, SHIFTS.YILLIK, SHIFTS.RAPOR,
      'İZİNLİ', 'YILLIK İZİN', 'RAPORLU', null, undefined, ''
    ];

    // Izin/rapor gunleri personelin ana biriminde gosterilir.
    // Sadece fiilen calistigi gunlerde gecici/gunluk atama hedef birime tasinir.
    if (offValues.includes(shiftValue)) return person.birim;

    try {
      if (typeof getGecerliBirim === 'function') {
        const unit = getGecerliBirim(person, dayIndex);
        if (unit) return unit;
      }
    } catch (_) {}

    // getGecerliBirim erişilemezse ayni state verisinden guvenli fallback.
    try {
      const date = new Date(currentMonday);
      date.setDate(date.getDate() + dayIndex);
      const dateKey = (typeof getDateKey === 'function')
        ? getDateKey(date)
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const temp = state.geciciGorevler && state.geciciGorevler[`${dateKey}_${person.ad}`];
      if (temp) return temp;
    } catch (_) {}

    return person.birim;
  }

  function isTrainingAssignmentForExport(person, dayIndex) {
    try {
      if (!person || !state.schedulerV2 || !state.schedulerV2.assignmentSource) return false;
      const hKey = (typeof getDateKey === 'function') ? getDateKey(currentMonday) : '';
      const key = `${hKey}_${person.ad}_${dayIndex}`;
      return state.schedulerV2.assignmentSource[key] === 'AUTO_V62_TRAINING';
    } catch (_) { return false; }
  }

  function trainingHomeUnitLabelForExport(person) {
    if (!person) return '-';
    try {
      if (typeof gorevYeriBirimEtiketi === 'function') return gorevYeriBirimEtiketi(person.birim) || person.birim || '-';
    } catch (_) {}
    return String(person.birim || '-').replace(/\s+OPERATÖRÜ$/u, '').trim();
  }

  const PERSON_COLOR_MAP = new Map(
    PERSON_COLOR_ENTRIES.map(([name, color]) => [normalizeExportText(name), color])
  );

  function personColor(name) {
    const key = normalizeExportText(name);
    if (!key) return null;
    if (PERSON_COLOR_MAP.has(key)) return PERSON_COLOR_MAP.get(key);

    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    return PERSON_FALLBACK_PALETTE[Math.abs(hash) % PERSON_FALLBACK_PALETTE.length];
  }

  function contrastFontColor(hex) {
    const v = String(hex || '#FFFFFF').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(v)) return 'FF000000';
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return ((0.299 * r) + (0.587 * g) + (0.114 * b)) < 115 ? 'FFFFFFFF' : 'FF000000';
  }

  function orderedUnitSpecs() {
    const actual = Array.isArray(state.birimler) ? [...state.birimler] : [];
    const used = new Set();
    const out = [];

    for (const spec of UNIT_EXPORT_ORDER) {
      const aliases = spec.aliases.map(normalizeExportText);
      const match = actual.find((unit) => !used.has(unit) && aliases.includes(normalizeExportText(unit)));
      if (match) {
        used.add(match);
        out.push({ key: match, label: spec.label });
      }
    }

    for (const unit of actual) {
      if (!used.has(unit)) out.push({ key: unit, label: unit });
    }
    return out;
  }

  function scheduleHeaderDateText(date) {
    return `${String(date.getDate()).padStart(2, '0')} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  function workingShifts() {
    const off = new Set([
      SHIFTS.IZIN, SHIFTS.BOS, SHIFTS.YILLIK, SHIFTS.RAPOR,
      'İZİNLİ', 'YILLIK İZİN', 'RAPORLU', null, undefined, ''
    ]);
    // Sadece XLSX gorunumu. 18:00–02:00 satiri 00:00–07:00'in USTUNDE.
    // state.saatler / otomasyon / dinlenme kurali degistirilmez.
    return (state.saatler || []).filter(s => !off.has(s)).sort((a,b) => {
      const start = x => { const m = String(x).match(/^(\d{1,2}):\d{2}/); return m ? ((+m[1] + 23) % 24) + 1 : 99; };
      return start(a) - start(b);
    });
  }

  // FIX2.29: XLSX'te yalniz gercek 360 rolu, hedef-birim degisikligi ve OGRENME
  // etiketlenir. Ana birim personeline KJ/PLAYOUT metni otomatik eklenmez.
  function formatPersonForExport(person, dayIndex, shiftValue, exportUnit) {
    if (!person) return '';
    if (shiftValue === 'İZİN') return person.ad;
    const actualUnit = effectiveUnitForExport(person, dayIndex, shiftValue);
    const actualFamily = exportUnitFamily(actualUnit);
    const homeFamily = exportUnitFamily(person.birim);
    const targetFamily = exportUnitFamily(exportUnit);
    // Asil personel, Excel sayfasinda FIILEN atandigi HEDEF birimde kalir.
    // OGRENME bu birimin nitelikli kadrosu sayilmasini degistirmez.
    if (isTrainingAssignmentForExport(person, dayIndex)) {
      return `${person.ad} (ÖĞRENME)`;
    }
    let role = '';
    try {
      if (typeof mobilGorevYeriEtiketi === 'function') {
        role = String(mobilGorevYeriEtiketi(person.ad, dayIndex, shiftValue) || '').trim();
      }
    } catch (_) {}
    // 360TV, 360 TV veya 360 ile yazilmis gercek rol ayni iki Excel etiketine iner.
    const r = role.toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ');
    if (targetFamily === exportUnitFamily('KJ OPERATÖRÜ') && /^360\s*(?:TV\s*)?KJ$/.test(r)) {
      return `${person.ad}\n360 KJ`;
    }
    if (targetFamily === exportUnitFamily('PLAYOUT OPERATÖRÜ') && /^360\s*(?:TV\s*)?PLAYOUT$/.test(r)) {
      return `${person.ad}\n360 PLAYOUT`;
    }
    if (actualFamily !== homeFamily) {
      let targetLabel = actualUnit;
      try {
        if (typeof gorevYeriBirimEtiketi === 'function')
          targetLabel = gorevYeriBirimEtiketi(actualUnit) || targetLabel;
      } catch (_) {}
      // Hedef birim ismi, ana birim etiketini veya tablo basligini degistirmez.
      return `${person.ad}\n${targetLabel}`;
    }
    return person.ad;
  }

  // FIX2.28: Workbook olustururken her birim/saat/gun icin tum personeli
  // tekrar tekrar taramak yerine haftalik listeyi TEK geciste indeksle.
  function buildWeeklyExportIndex() {
    const hKey = safeMondayKey();
    const assignments = state.manuelAtamalar || {};
    const perUnitShiftDay = new Map();
    const perShiftDay = new Map();
    const off = new Set([SHIFTS.IZIN, SHIFTS.BOS, SHIFTS.YILLIK, SHIFTS.RAPOR,
      'İZİNLİ', 'YILLIK İZİN', 'RAPORLU', null, undefined, '']);
    const groupKey = (unit, shift, day) => `${unit}|||${shift}|||${day}`;
    const add = (map, key, person) => {
      let list = map.get(key);
      if (!list) { list = []; map.set(key, list); }
      list.push(person);
    };
    for (const person of (state.personeller || [])) {
      if (!person || !person.ad) continue;
      for (let day = 0; day < 7; day++) {
        const shift = assignments[`${hKey}_${person.ad}_${day}`];
        if (off.has(shift)) {
          add(perUnitShiftDay, groupKey(exportUnitFamily(person.birim), 'İZİN', day), person);
        } else {
          const unit = exportUnitFamily(effectiveUnitForExport(person, day, shift));
          add(perUnitShiftDay, groupKey(unit, shift, day), person);
          add(perShiftDay, `${shift}|||${day}`, person);
        }
      }
    }
    // Ulastirma sekmesindeki orijinal birim ve isim siralamasini koru.
    for (const [key, list] of perShiftDay) {
      const day = Number(key.split('|||').pop());
      list.sort((a,b) => {
        const aUnit = effectiveUnitForExport(a,day,assignments[`${hKey}_${a.ad}_${day}`]);
        const bUnit = effectiveUnitForExport(b,day,assignments[`${hKey}_${b.ad}_${day}`]);
        const ai = Math.max(-1, (state.birimler || []).indexOf(aUnit));
        const bi = Math.max(-1, (state.birimler || []).indexOf(bUnit));
        return ai - bi || String(a.ad||'').localeCompare(String(b.ad||''),'tr-TR');
      });
    }
    return {
      unitDay: (unit, shift, day) => perUnitShiftDay.get(groupKey(exportUnitFamily(unit),shift,day)) || [],
      shiftDay: (shift,day) => perShiftDay.get(`${shift}|||${day}`) || []
    };
  }

  function personsForShiftDay(hKey, shift, dayIndex) {
    const rows = (state.personeller || []).filter((p) => {
      return state.manuelAtamalar[`${hKey}_${p.ad}_${dayIndex}`] === shift;
    });

    rows.sort((a, b) => {
      let aUnit = a.birim;
      let bUnit = b.birim;
      try {
        if (typeof getGecerliBirim === 'function') {
          aUnit = getGecerliBirim(a, dayIndex);
          bUnit = getGecerliBirim(b, dayIndex);
        }
      } catch (_) {}
      const ai = Math.max(-1, (state.birimler || []).indexOf(aUnit));
      const bi = Math.max(-1, (state.birimler || []).indexOf(bUnit));
      if (ai !== bi) return ai - bi;
      return String(a.ad || '').localeCompare(String(b.ad || ''), 'tr-TR');
    });

    return rows;
  }

  function shiftStartLabel(shift) {
    const s = String(shift || '').trim();
    const m = s.match(/(\d{1,2}:\d{2})/);
    return m ? m[1] : s.split(/[–—-]/)[0].trim();
  }

  async function buildCurrentLayoutWorkbook(ExcelJS, existingWorkbook, sheetName, exportIndex) {
    const wb = existingWorkbook || new ExcelJS.Workbook();
    const weeklyIndex = exportIndex || buildWeeklyExportIndex();
    if (!existingWorkbook) {
      wb.creator = 'TURKMEDYA Teknik Vardiya';
      wb.lastModifiedBy = 'TURKMEDYA V62';
      wb.created = new Date();
      wb.modified = new Date();
    }

    const ws = wb.addWorksheet(sheetName || 'Vardiya', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    // Keep the accepted FIX2.9/FIX2.10 schedule footprint.
    for (let c = 1; c <= 8; c++) ws.getColumn(c).width = MAIN_SHEET_COLUMN_WIDTH;

    const thin = border('thin');
    const medium = border('medium');
    const baseAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Row 1: accepted title layout remains.
    ws.mergeCells(1, 1, 1, 8);
    const title = ws.getCell(1, 1);
    title.value = 'TEKNİK PERSONEL ÇALIŞMA LİSTESİ';
    setCellStyle(title, {
      fill: '#1e293b',
      font: { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } },
      alignment: baseAlign,
      border: medium
    });
    ws.getRow(1).height = MAIN_SHEET_ROW_HEIGHT;
    for (let c = 1; c <= 8; c++) setCellStyle(ws.getCell(1, c), { fill: '#1e293b', border: medium });

    // Dates + full day names, following the supplied weekly workbook.
    ws.mergeCells('A2:A3');
    const timeHeader = ws.getCell('A2');
    timeHeader.value = 'SAAT';
    setCellStyle(timeHeader, {
      fill: '#403152',
      font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
      alignment: baseAlign,
      border: medium
    });

    const fullDays = ['PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ', 'PAZAR'];
    for (let d = 0; d < 7; d++) {
      const date = new Date(currentMonday);
      date.setDate(date.getDate() + d);

      const dateCell = ws.getCell(2, d + 2);
      dateCell.value = scheduleHeaderDateText(date);
      setCellStyle(dateCell, {
        fill: '#403152',
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
        alignment: baseAlign,
        border: medium
      });

      const dayCell = ws.getCell(3, d + 2);
      dayCell.value = fullDays[d];
      setCellStyle(dayCell, {
        fill: '#403152',
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
        alignment: baseAlign,
        border: medium
      });
    }
    ws.getRow(2).height = MAIN_SHEET_ROW_HEIGHT;
    ws.getRow(3).height = MAIN_SHEET_ROW_HEIGHT;

    let rowNo = 4;
    const hKey = safeMondayKey();

    // Reference order: Sistem -> Teknik Yönetmen -> Ses -> Playout -> KJ -> Ingest -> Uplink -> ...
    orderedUnitSpecs().forEach(({ key: birim, label: displayLabel }) => {
      // FIX2.31: Birim basligi A:H tam ORTADA. Once tum hucreleri boya,
      // sonra birlestir ve en son master A hucre hizasini uygula.
      // ExcelJS merge proxy hucrelerine sonradan stil yazilmaz.
      const unitColor = MAIN_UNIT_HEADER_COLOR;
      for (let c = 1; c <= 8; c++) {
        setCellStyle(ws.getCell(rowNo, c), { fill: unitColor, border: medium });
      }
      ws.mergeCells(rowNo, 1, rowNo, 8);
      const u = ws.getCell(rowNo, 1);
      u.value = displayLabel;
      setCellStyle(u, {
        fill: unitColor,
        font: { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: false },
        border: medium
      });
      ws.getRow(rowNo).height = 25;
      rowNo++;

      [...workingShifts(), 'İZİN'].forEach((shift, index) => {
        const dayLists = [];
        let maxRows = 1;

        for (let d = 0; d < 7; d++) {
          const list = weeklyIndex.unitDay(birim, shift, d);
          dayLists[d] = list;
          if (list.length > maxRows) maxRows = list.length;
        }

        let rowColor = (state.saatAyarlari && state.saatAyarlari[shift])
          ? state.saatAyarlari[shift].renk
          : (DEFAULT_SHIFT_COLORS[index] || '#ffffff');
        if (shift === 'İZİN') rowColor = '#fef2f2';

        const startRow = rowNo;
        const endRow = rowNo + maxRows - 1;
        if (maxRows > 1) ws.mergeCells(startRow, 1, endRow, 1);

        for (let r = 0; r < maxRows; r++, rowNo++) {
          // Sadece gercek ikinci satir varsa yukseklik artar; tum KJ/PLAYOUT
          // satirlarini 28pt yapip orijinal Excel duzenini kaydirmiyoruz.
          const hasSecondLine = dayLists.some((items, day) => {
            const p = items[r];
            return p && formatPersonForExport(p, day, shift, birim).includes('\n');
          });
          ws.getRow(rowNo).height = hasSecondLine ? 28 : MAIN_SHEET_ROW_HEIGHT;
          for (let c = 1; c <= 8; c++) {
            const cell = ws.getCell(rowNo, c);
            setCellStyle(cell, {
              fill: rowColor,
              font: { name: 'Arial', size: 7, bold: true, color: { argb: 'FF000000' } },
              alignment: baseAlign,
              border: thin
            });
          }

          if (r === 0) ws.getCell(rowNo, 1).value = shift;

          for (let d = 0; d < 7; d++) {
            const person = dayLists[d][r];
            const cell = ws.getCell(rowNo, d + 2);
            cell.value = formatPersonForExport(person, d, shift, birim);

            // Person color follows the supplied reference workbook.
            // Empty cells keep their shift-row color.
            if (person && person.ad) {
              const pColor = personColor(person.ad);
              if (pColor) {
                cell.fill = fill(pColor);
                cell.font = {
                  name: 'Arial',
                  size: 7,
                  bold: true,
                  color: { argb: contrastFontColor(pColor) }
                };
              }
            }
          }
        }
      });
    });

    ws.views = [{ state: 'frozen', ySplit: 3 }];
    return wb;
  }

  function styleTransportHeaderCell(cell) {
    setCellStyle(cell, {
      fill: '#800002',
      font: { name: 'Arial', size: 12, bold: true, italic: true, color: { argb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: border('medium')
    });
  }

  async function buildTransportTemplateWorkbook(ExcelJS, existingWorkbook, sheetName, exportIndex) {
    const wb = existingWorkbook || new ExcelJS.Workbook();
    const weeklyIndex = exportIndex || buildWeeklyExportIndex();
    if (!existingWorkbook) {
      wb.creator = 'TURKMEDYA Teknik Vardiya';
      wb.lastModifiedBy = 'TURKMEDYA V62';
      wb.created = new Date();
      wb.modified = new Date();
    }

    const ws = wb.addWorksheet(sheetName || 'ULAŞTIRMA', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    // Exact column widths sampled from the supplied ULAŞTIRMA workbook.
    const widths = [32, 53.33203125, 47.6640625, 47.6640625, 54.88671875, 54.88671875, 47.6640625, 46.88671875];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    ws.mergeCells('A1:A2');
    for (let r = 1; r <= 2; r++) {
      const a = ws.getCell(r, 1);
      setCellStyle(a, { fill: '#800002', border: border('medium') });
    }
    ws.getRow(1).height = 25.5;
    ws.getRow(2).height = 36.75;

    const fullDays = ['PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ', 'PAZAR'];
    for (let d = 0; d < 7; d++) {
      const date = new Date(currentMonday);
      date.setDate(date.getDate() + d);

      const dc = ws.getCell(1, d + 2);
      dc.value = date;
      dc.numFmt = 'dd/mm/yyyy';
      styleTransportHeaderCell(dc);

      const dayCell = ws.getCell(2, d + 2);
      dayCell.value = fullDays[d];
      styleTransportHeaderCell(dayCell);
    }

    // FIX2.31: iki orijinal logoyu tek yanyana goruntu olarak ankrajla.
    // Ayrik ExcelJS fractional TL koordinatlari kimi Excel surumlerinde
    // logolari ust uste bindiriyor. Tek resim => cakisma imkansiz.
    try {
      const pairId = wb.addImage({ base64: HEADER_LOGO_PAIR_BASE64, extension: 'png' });
      ws.addImage(pairId, { tl: { col: 0.08, row: 0.10 }, ext: { width: 156, height: 54 } });
    } catch (e) {
      console.warn('[FIX2.31] Ulaştırma logoları eklenemedi:', e);
    }

    const hKey = safeMondayKey();
    let rowNo = 3;
    const mediumSide = { style: 'medium', color: { argb: 'FF000000' } };

    for (const shift of workingShifts()) {
      const lists = [];
      let maxRows = 1;
      for (let d = 0; d < 7; d++) {
        lists[d] = weeklyIndex.shiftDay(shift, d);
        if (lists[d].length > maxRows) maxRows = lists[d].length;
      }

      const startRow = rowNo;
      const endRow = rowNo + maxRows - 1;

      for (let r = 0; r < maxRows; r++, rowNo++) {
        ws.getRow(rowNo).height = 18;
        // Her blokta tek buyuk, yatay+dikey ORTALI saat hucresi olusturulacak.
        // Merge proxy'lerine sonradan stil verilmesi Excel'de hizayi bozuyordu.
        setCellStyle(ws.getCell(rowNo, 1), {
          fill: '#800002',
          border: {
            left: mediumSide,
            right: mediumSide,
            top: r === 0 ? mediumSide : undefined,
            bottom: r === maxRows - 1 ? mediumSide : undefined
          }
        });

        for (let d = 0; d < 7; d++) {
          const cell = ws.getCell(rowNo, d + 2);
          cell.value = lists[d][r] ? lists[d][r].ad : '';
          setCellStyle(cell, {
            fill: '#558ED5',
            font: { name: 'Arial', size: 12, bold: true, italic: true, color: { argb: 'FF000000' } },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: false },
            border: {
              left: mediumSide,
              right: mediumSide,
              top: r === 0 ? mediumSide : undefined,
              bottom: r === maxRows - 1 ? mediumSide : undefined
            }
          });
        }
      }
      // Saat araligina ait BUTUN personele tek saat etiketi; A hucreleri
      // once hazirlanir, sonra merge edilir ve final style MASTER'a verilir.
      if (maxRows > 1) ws.mergeCells(startRow, 1, endRow, 1);
      const timeMaster = ws.getCell(startRow, 1);
      timeMaster.value = shiftStartLabel(shift);
      setCellStyle(timeMaster, {
        fill: '#800002',
        font: { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: false },
        border: border('medium')
      });
    }

    ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 1 }];
    return wb;
  }

  async function buildCombinedWorkbook(ExcelJS) {
    const names = weekWorkbookNames();
    const exportIndex = buildWeeklyExportIndex();
    const wb = await buildCurrentLayoutWorkbook(ExcelJS, null, names.scheduleSheet, exportIndex);
    await buildTransportTemplateWorkbook(ExcelJS, wb, names.transportSheet, exportIndex);

    // Main weekly schedule opens first; ULAŞTIRMA sits immediately beside it as the second tab.
    wb.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
    return wb;
  }

  // FIX2.32: ExcelJS workbook.model -> Worker -> Workbook.model yoldan gecince
  // ExcelJS 4.4 bazi merge'leri kaybedebiliyor. Merge listesi workbook'un kendi
  // _merges kaydindan AYRI ve acik aktarilir. Merge bilgisi bulunamazsa eski
  // yola sessizce dusulmez; yazilan dosyayi bozuk kabul edip ana is parcaciginda
  // (orijinal workbook'tan) serilestiririz.
  function expectedWorkbookMerges(workbook) {
    const manifest = [];
    workbook.eachSheet((ws) => {
      const privateMerges = Object.values(ws._merges || {}).map(m => m && m.range).filter(Boolean);
      const modelMerges = (ws.model && ws.model.merges) || [];
      const ranges = Array.from(new Set([...privateMerges, ...modelMerges].map(String)));
      manifest.push({ name: ws.name, ranges });
    });
    if (!manifest.length || manifest.some(m => !m.ranges.length)) {
      throw new Error('Excel birlestirme manifesti olusturulamadi; guvenli serilestirme gerekli.');
    }
    return manifest;
  }

  // XLSX ZIP/deflate ana thread'de calisirsa Chrome 'Bekle / Sayfadan cik' verebilir.
  // Serilestirmeyi AYRI WEB WORKER'a tasi; dosyanin iki sekmeli yapisi ayni kalir.
  function writeWorkbookOffMainThread(workbook) {
    return new Promise((resolve, reject) => {
      if (typeof Worker === 'undefined') { reject(new Error('Web Worker desteklenmiyor.')); return; }
      let worker;
      try { worker = new Worker('excel-export-worker-fix2-28.js?v=20261012-fix2-32-merge-restore'); }
      catch (e) { reject(e); return; }
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        worker.terminate();
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('Excel Worker sure asimi (90s).')), 90000);
      worker.onerror = e => finish(new Error(e.message || 'Excel Worker baslatilamadi.'));
      worker.onmessage = e => {
        const data = e.data || {};
        if (data.ok) finish(null, data.buffer);
        else finish(new Error(data.error || 'Excel Worker yazma hatasi.'));
      };
      try {
        const mergeManifest = expectedWorkbookMerges(workbook);
        worker.postMessage({ model: workbook.model, mergeManifest });
      }
      catch (e) { finish(e); }
    });
  }

  let exportPending = false;
  async function exportWorkbook(builder, fileName, successMessage) {
    if (exportPending) { toast('⏳ Excel dosyasi zaten hazirlaniyor...', 'info'); return; }
    exportPending = true;
    try {
      toast('⏳ Excel hazirlaniyor; sayfayi kullanmaya devam edebilirsiniz.', 'info');
      const ExcelJS = await ensureExcelJS();
      // Toast'un ve tarayici olaylarinin boyanabilmesi icin bir frame birak.
      await new Promise(r => setTimeout(r, 0));
      const wb = await builder(ExcelJS);
      let buffer;
      try { buffer = await writeWorkbookOffMainThread(wb); }
      catch (workerError) {
        console.warn('[FIX2.28] Arka plan yazici kullanilamadi:', workerError);
        // Desteklenmeyen sistemde eski indirme yolunu koru, veriyi kaybetme.
        toast('⚠️ Arka plan Excel yazicisi kullanilamadi; uyumluluk modunda indiriliyor.', 'warning');
        buffer = await wb.xlsx.writeBuffer();
      }
      downloadBuffer(buffer, fileName);
      toast(successMessage, 'success');
    } catch (error) {
      console.error('[FIX2.28] Excel export error:', error);
      toast('❌ Excel oluşturulamadı: ' + String(error && error.message ? error.message : error), 'error');
    } finally {
      exportPending = false;
    }
  }

  // Only the Excel download functions are overridden. app.js itself stays byte-identical.
  // Both buttons now produce ONE workbook: weekly schedule + ULAŞTIRMA as adjacent tabs.
  global.excelIndir = function () {
    const names = weekWorkbookNames();
    return exportWorkbook(
      buildCombinedWorkbook,
      names.fileName,
      '✅ Tek Excel dosyası hazırlandı: çalışma listesi + ULAŞTIRMA sekmesi.'
    );
  };

  global.ulastirmaExcelIndir = function () {
    const names = weekWorkbookNames();
    return exportWorkbook(
      buildCombinedWorkbook,
      names.fileName,
      '✅ Tek Excel dosyası hazırlandı: çalışma listesi + ULAŞTIRMA sekmesi.'
    );
  };

  global.TMRealExcelExport = {
    version: VERSION,
    weekWorkbookNames,
    buildCurrentLayoutWorkbook,
    buildTransportTemplateWorkbook,
    workingShifts,
    formatPersonForExport,
    buildWeeklyExportIndex,
    writeWorkbookOffMainThread,
    buildCombinedWorkbook
  };

  console.log(`[TMRealExcelExport] ${VERSION} loaded.`);
})(window);
