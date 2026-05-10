/*------- BUSINESS KPI -------*/
/*--- GLOBAL PLAYER REPORT ---*/

SET NOCOUNT ON
DECLARE @_DataDa   DATETIME =  CONVERT(datetimeoffset, $__timeFrom(), 127),
        @_DataA    DATETIME =  CONVERT(datetimeoffset, $__timeTo(), 127)

DECLARE @_DataDaSmallDateTime   SMALLDATETIME =  @_DataDa,
        @_DataASmallDateTime    SMALLDATETIME =  @_DataA

-- LOAD GRAFANA FILTERS AND ADD IT A TEMP
SELECT
    IDBookmaker = CAST(SUBSTRING(CAST([value] AS VARCHAR(29)),0,CHARINDEX('-', CAST([value] AS VARCHAR(29)))-1) AS SMALLINT)
INTO #BookmakersFilter
FROM
    STRING_SPLIT('${Bookmaker:csv}', ',')

SELECT
    TestUser = CAST(CASE WHEN [value] = 'Test' THEN 1 ELSE 0 END AS TINYINT)
INTO #TestUsers
FROM
    STRING_SPLIT('${TestUsers:csv}', ',')

-- PRELOAD USER LIST 
SELECT 
    UU.IDUtente,
    UU.Nome,
    UU.Cognome,
    UU.[Uid],
    UU.IDValuta,
    VipCode = UD.Valore,
    VA.Simbolo
INTO 
    #Users
FROM 
    [ISBets_BI].[Dwh].[Utenti]                          UU
    INNER JOIN [ISBets_BI].[Dwh].[Valute]               VA ON VA.IDValuta    = UU.IDValuta
    LEFT JOIN  [ISBets_BI].[Dwh].[UtentiDatiAggiuntivi] UD ON UD.IDUtente    = UU.IDUtente AND UD.IDTipoDatoUtente = 108 -- VIP User
    INNER JOIN #BookmakersFilter                        BF ON BF.IDBookmaker = UU.IDBookmaker
    INNER JOIN #TestUsers                               TU ON TU.TestUser    = UU.TestUser
WHERE
    ('$VipCode' = '' OR UD.Valore LIKE CONCAT('%','$VipCode','%'))
   --AND UU.IDUtente = 389800

-- SPORT DATA LOADING
SELECT
    UserID     = BS.IDUtente,
    RealWager  = CAST(ISNULL(SUM(CASE WHEN BS.IDTipoAccredito  = 1 THEN BS.Importo ELSE 0 END),0) AS DECIMAL(16,4)),
    BonusWager = CAST(ISNULL(SUM(CASE WHEN BS.IDTipoAccredito != 1 THEN BS.Importo ELSE 0 END),0) AS DECIMAL(16,4)),
    Bets       = ISNULL(COUNT(DISTINCT BS.IDCoupon),0)
INTO 
    #SportPlaced
FROM
    [ISBets_BI].[Dwh].[Coupon] BS
    INNER JOIN #Users          U  ON BS.IDUtente = U.IDUtente
WHERE
    BS.DataInserimento >= @_DataDa 
    AND BS.DataInserimento < @_DataA
GROUP BY 
    BS.IDUtente

SELECT
    UserID              = BS.IDUtente,
    RealWin             = CAST(ISNULL(SUM(  CASE WHEN BS.IDEsitoCoupon = 1 AND BS.IDTipoAccredito  = 1 THEN BS.Vincita  ELSE 0 END),0) AS DECIMAL(16,4)),
    BonusWin            = CAST(ISNULL(SUM(  CASE WHEN BS.IDEsitoCoupon = 1 AND BS.IDTipoAccredito <> 1 THEN BS.Vincita  ELSE 0 END),0) AS DECIMAL(16,4)),
    WinningBets         =      ISNULL(COUNT(CASE WHEN BS.IDEsitoCoupon = 1                             THEN BS.IDCoupon END),0),
    CancelledAmount     = CAST(ISNULL(SUM(  CASE WHEN BS.IDEsitoCoupon = 4                             THEN BS.Vincita  ELSE 0 END),0) AS DECIMAL(16,4))
INTO 
    #SportSettled
FROM
    [ISBets_BI].[Dwh].[Coupon] BS
    INNER JOIN #Users          U  ON BS.IDUtente = U.IDUtente
WHERE
    BS.DataPagamento >= @_DataDa 
    AND BS.DataPagamento < @_DataA
    AND BS.IDStatoCoupon = 50 
    AND BS.IDEsitoCoupon IN (1,4)
GROUP BY 
    BS.IDUtente

-- GAMING BASE DATA LOADING
SELECT 
    UserID        = U.IDUtente,
    Stake         = SUM(C.ImportoGiocato),
    Winnings      = SUM(C.ImportoVinto),
    BonusStake    = SUM(C.ImportoGiocatoBonus),
    BonusWinnings = SUM(C.ImportoVintoBonus),
    BetsNumber    = SUM(C.NScommesse)
INTO #GamingPlaced
FROM 
    [ISBets_BI].[Dwh].[StoricoCasino]        C 
    INNER JOIN [ISBets_BI].[Dwh].[Providers] P ON P.IDProvider = C.IDProvider 
    INNER JOIN #Users                        U ON C.IDUtente   = U.IDUtente
WHERE 
    C.[Data] >= @_DataDa
    AND C.[Data] < @_DataA
    AND P.IDTipoProvider IN (5, 9)
GROUP BY
    U.IDUtente
   
-- BUILDING REASON TEMP TABLE
;WITH CTE_TerzePartiCausaliProviders AS
(    
    SELECT 
        P.IDProvider,
        P.IDTipoProvider,
        RP.IDCausale,
        RP.IDCausaleStorno,
        RP.IDTipoSezione
    FROM 
        [ISBets_BI].[Dwh].[CausaliProviders]     RP
        INNER JOIN [ISBets_BI].[Dwh].[Providers] P  ON RP.IDProvider = P.IDProvider
    WHERE 
        P.IDProvider != 233 -- SPORT
)

SELECT 
    IDProvider,
    IDTipoSezione,
    [Type] = 1, 
    IDCausale,
    IDTipoProvider
INTO #TerzePartiCausaliProviders_List 
FROM 
    CTE_TerzePartiCausaliProviders 
UNION ALL
SELECT 
    IDProvider,
    IDTipoSezione,
    [Type] =  2, 
    IDCausaleStorno,
    IDTipoProvider
FROM 
    CTE_TerzePartiCausaliProviders    
UNION ALL
/*MANUAL ADD SPORT TO GET REDEEM DATA*/
SELECT 
    IDProvider = 233, -- SPORT
    IDTipoSezione = 4, -- WITHDRAWAL
    [Type] = 1,
    IDCausale = 54, -- REDEEM
    IDTipoProvider = 13

-- PRELOAD STATS TRANSAZIONI 
SELECT 
    T.IDUtente,
    T.Importo,
    T.Qta,
    T.IDGestore,
    C.IDTipoProvider,
    C.IDTipoSezione,
    C.[Type],
    C.IDProvider,
    C.IDCausale
INTO 
    #StatsTransazioni_Temp
FROM 
    [ISBets_BI].[Stats].[Transazioni]           T
    INNER JOIN #Users                           U  ON T.IDUtente  = U.IDUtente
    INNER JOIN #TerzePartiCausaliProviders_List C  ON T.IDCausale = C.IDCausale 
WHERE 
    T.[Data] >= @_DataDa
    AND T.[Data] < @_DataA 

-- GAMING NUMBER OF BET WINNING (UNAVAILABLE ON TP.StoricoCasino)
SELECT 
    UserID = IDUtente,
    WinningBets = ISNULL(SUM(CASE WHEN [Type] = 1 THEN QTA END),0) - ISNULL(SUM(CASE WHEN [Type] = 2 THEN QTA END),0)
INTO 
    #GamingWinnings
FROM 
    #StatsTransazioni_Temp  
WHERE 
    IDTipoProvider IN (5,9) 
    AND IDTipoSezione = 5
GROUP BY 
    IDUtente

-- LOTTO DATA
SELECT 
    UserID          = IDUtente,
    Stake           = ISNULL(SUM(CASE WHEN [Type] = 1 AND IDTipoSezione = 4  AND IDGestore IS NULL THEN ABS(Importo) ELSE 0 END),0) - ISNULL(SUM(CASE WHEN [Type] = 2 AND IDTipoSezione = 4 AND IDGestore IS NULL  THEN ABS(Importo) ELSE 0 END),0),
    Winnings        = ISNULL(SUM(CASE WHEN [Type] = 1 AND IDTipoSezione = 5  AND IDGestore IS NULL THEN ABS(Importo) ELSE 0 END),0) - ISNULL(SUM(CASE WHEN [Type] = 2 AND IDTipoSezione = 5 AND IDGestore IS NULL  THEN ABS(Importo) ELSE 0 END),0),
    BetsNumber      = ISNULL(SUM(CASE WHEN [Type] = 1 AND IDTipoSezione = 4 THEN QTA END),0) - ISNULL(SUM(CASE WHEN [Type] = 2 AND IDTipoSezione = 4 THEN QTA END),0),
    WinningBets     = ISNULL(SUM(CASE WHEN [Type] = 1 AND IDTipoSezione = 5 THEN QTA END),0) - ISNULL(SUM(CASE WHEN [Type] = 2 AND IDTipoSezione = 5 THEN QTA END),0)
INTO 
    #LottoData
FROM 
    #StatsTransazioni_Temp
WHERE
    IDGestore IS NULL
    AND IDProvider = 28 
GROUP BY 
    IDUtente

-- DEPOSIT AND WITHDRAWALS
SELECT 
    UserID,
    Deposits    = SUM(Deposits),
    Withdrawals = SUM(Withdrawals)
INTO 
    #DepositsAndWithdrawals
FROM (
    SELECT 
        UserID      = IDUtente,
        Deposits    = ABS(SUM(CASE WHEN IDTipoSezione = 5 AND [Type] = 1 THEN Importo ELSE 0 END)) - ABS(SUM(CASE WHEN IDTipoSezione = 5 AND [Type] = 2 THEN Importo ELSE 0 END)),
        Withdrawals = ABS(SUM(CASE WHEN IDTipoSezione = 4 AND [Type] = 1 THEN Importo ELSE 0 END)) - ABS(SUM(CASE WHEN IDTipoSezione = 4 AND [Type] = 2 THEN Importo ELSE 0 END))
    FROM 
        #StatsTransazioni_Temp
    WHERE
        IDTipoProvider IN (2, 6, 7, 8)
    GROUP BY 
        IDUtente
    UNION ALL 
	--MANUAL TRANSACTIONS
    SELECT
        UserID      = T.IDUtente,
        Deposits    = ABS(SUM(CASE WHEN Importo > 0 THEN Importo ELSE 0 END)),
        Withdrawals = ABS(SUM(CASE WHEN Importo < 0 THEN Importo ELSE 0 END))
    FROM
        [ISBets_BI].[Stats].[Transazioni]  T
        INNER JOIN #Users                  U  ON T.IDUtente  = U.IDUtente
    WHERE 
        T.[Data] >= @_DataDa
        AND T.[Data] < @_DataA 
        AND IDGestore > 0
    GROUP BY 
        T.IDUtente
) AS CombinedData
GROUP BY 
    UserID;

-- BONUS REDEEM
SELECT
    UserID = T.IDUtente,
    Amount = ABS(SUM(T.Importo))
INTO 
    #BonusRedeem
FROM 
    #StatsTransazioni_Temp        T
    INNER JOIN #Users                      U  ON T.IDUtente   = U.IDUtente
WHERE 
    T.IDProvider = 233 
    AND T.IDCausale = 54 -- RISCATTA BONUS
GROUP BY 
    T.IDUtente



-- BONUS CREDIT
-- AVOID TO USE REASON CODE FOR PERF PURPOSE
SELECT 
    UserID = BT.IDUtente, 
    AmountCredited  = ABS(SUM(CASE WHEN BT.IDCausale = 64 THEN BT.Importo ELSE 0 END)),
    AmountCancelled = ABS(SUM(CASE WHEN BT.IDCausale = 65 THEN BT.Importo ELSE 0 END))
INTO 
    #StandardBonusCreditAndCancel
FROM 
    [ISBets_BI].[Dwh].[BonusTransazioni]   BT
    INNER JOIN #Users                      U  ON BT.IDUtente  = U.IDUtente
WHERE 
    BT.[Data] >= @_DataDaSmallDateTime
    AND BT.[Data] < @_DataASmallDateTime
    AND BT.IDCausale IN (64,65)
GROUP BY
    BT.IDUtente

SELECT 
    BF.UserID, 
    Amount = SUM(BF.Amount)
INTO 
    #FreebetsBonusCredit
FROM 
    [ISBets_BI].[Dwh].[BonusFreeBets] BF
    INNER JOIN #Users                 U  ON BF.UserID = U.IDUtente
WHERE 
    BF.InsertDate >= @_DataDa
    AND BF.InsertDate < @_DataA 
GROUP BY
    BF.UserID


SELECT  
    UserID          = CT.IDUtente,
    TaxesPaidByUser = SUM(CT.Valore)
INTO 
    #TaxesPaidByUser
FROM 
    Dwh.CorrelazioneTransazioniDatiAggiuntivi CT
    INNER JOIN #Users                         U  ON CT.IDUtente = U.IDUtente
WHERE 
    CT.DataCreazione >= @_DataDa
    AND CT.DataCreazione < @_DataA 
    AND CT.IDTipoDatoAggiuntivoCorrelazioneTransazioni = 38 -- TaxesPaidByUser
GROUP BY
    CT.IDUtente


SELECT DISTINCT UserID
INTO #UserIDs
FROM
(
          SELECT UserId FROM #SportPlaced 
    UNION SELECT UserId FROM #SportSettled  
    UNION SELECT UserId FROM #GamingPlaced  
    UNION SELECT UserId FROM #GamingWinnings  
    UNION SELECT UserId FROM #LottoData  
    UNION SELECT UserId FROM #DepositsAndWithdrawals  
    UNION SELECT UserId FROM #BonusRedeem  
    UNION SELECT UserId FROM #FreebetsBonusCredit  
    UNION SELECT UserId FROM #StandardBonusCreditAndCancel 
    UNION SELECT UserId FROM #TaxesPaidByUser 
) U


SELECT  
    [UserID]                                   = UU.IDUtente,
    [Username]                                 = UU.[Uid],
    [Name Surname]                             = CONCAT(UU.Nome, ' ', UU.Cognome),
    [VipCode]                                  = UU.VipCode,
    [Currency]                                 = UU.Simbolo,
    [Sport Bets #]                             = ISNULL(SP.Bets,0),
    [Sport Real Wager]                         = ISNULL(SP.RealWager,0),
    [Sport Bonus Wager]                        = ISNULL(SP.BonusWager,0),
    [Sport Bonus Win]                          = ISNULL(SS.BonusWin,0),
    [Sport Real Win]                           = ISNULL(SS.RealWin,0),
    [Sport Winning Bets #]                     = ISNULL(SS.WinningBets,0),
    [Sport Cancelled Amount]                   = ISNULL(SS.CancelledAmount,0),
    [Gaming Bets #]                            = ISNULL(GP.BetsNumber,0),
    [Gaming Real Wager]                        = ISNULL(GP.Stake,0),
    [Gaming Bonus Wager]                       = ISNULL(GP.BonusStake,0),
    [Gaming Real Win]                          = ISNULL(GP.Winnings,0),
    [Gaming Bonus Win]                         = ISNULL(GP.BonusWinnings,0),
    [Gaming Winning Bets #]                    = ISNULL(GW.WinningBets,0),
    [Lotto Bets #]                             = ISNULL(LD.BetsNumber,0),
    [Lotto Wager]                              = ISNULL(LD.Stake,0),
    [Lotto Win]                                = ISNULL(LD.Winnings,0),
    [Lotto Winning Bets #]                     = ISNULL(LD.WinningBets,0),
    [Deposits]                                 = ISNULL(DW.Deposits,0),
    [Withdrawals]                              = ISNULL(DW.Withdrawals,0),
    [Bonus Redeem]                             = ISNULL(BR.Amount,0),
    [Bonus Standard Issued]                    = ISNULL(SB.AmountCredited,0),
    [Bonus Standard Reverse]                   = ISNULL(SB.AmountCancelled,0),
    [Bonus Freebets Issued]                    = ISNULL(FB.Amount,0),
    [Bonus Total Issued]                       = ISNULL(SB.AmountCredited,0) + ISNULL(FB.Amount,0),
    [Bonus Standard Spend (Issued - Reversed)] = ISNULL(SB.AmountCredited,0) - ISNULL(SB.AmountCancelled,0),
    [Taxes Paid By User]                       = ISNULL(TA.TaxesPaidByUser,0)
FROM 
    #UserIDs                                 U
    INNER JOIN #Users                        UU  ON UU.IDUtente = U.UserID
    LEFT  JOIN #SportPlaced                  SP  ON SP.UserID   = U.UserID
    LEFT  JOIN #SportSettled                 SS  ON SS.UserID   = U.UserID
    LEFT  JOIN #GamingPlaced                 GP  ON GP.UserID   = U.UserID
    LEFT  JOIN #GamingWinnings               GW  ON GW.UserID   = U.UserID
    LEFT  JOIN #LottoData                    LD  ON LD.UserID   = U.UserID
    LEFT  JOIN #DepositsAndWithdrawals       DW  ON DW.UserID   = U.UserID
    LEFT  JOIN #BonusRedeem                  BR  ON BR.UserID   = U.UserID
    LEFT  JOIN #FreebetsBonusCredit          FB  ON FB.UserID   = U.UserID
    LEFT  JOIN #StandardBonusCreditAndCancel SB  ON SB.UserID   = U.UserID
    LEFT  JOIN #TaxesPaidByUser              TA  ON TA.UserID   = U.UserID
