export interface Card {
  id: string
  title: string
  /** where the wording comes from, shown next to the title */
  source: string
  group: string
  /** literal text to memorize; every line break starts a separate fragment */
  text: string
  paused?: boolean
}

const G1 = 'Dato personal y dato sensible'
const G2 = 'Responsable y encargado'
const G3 = 'Falencias de la Ley 19.628'
const G4 = 'Principios de la Ley 21.719'
const G5 = 'Ámbito de aplicación'
const G6 = 'Consentimiento y fuentes'
const G7 = 'Derechos del titular'

export const SEED_CARDS: Card[] = [
  {
    id: 'dato-personal-21719',
    title: 'Dato personal',
    source: 'Ley 21.719, art. 2',
    group: G1,
    text: 'cualquier información vinculada o referida a una persona natural identificada o identificable. Se considerará identificable toda persona cuya identidad pueda determinarse, directa o indirectamente, en particular mediante uno o más identificadores, tales como el nombre, el número de cédula de identidad, el análisis de elementos propios de la identidad física, fisiológica, genética, psíquica, económica, cultural o social de dicha persona.',
  },
  {
    id: 'dato-sensible-21719',
    title: 'Datos personales sensibles',
    source: 'Ley 21.719, art. 2',
    group: G1,
    text: 'tendrán esta condición aquellos datos personales que se refieren a las características físicas o morales de las personas o a hechos o circunstancias de su vida privada o intimidad, que revelen el origen étnico o racial, la afiliación política, sindical o gremial, la situación socioeconómica, las convicciones ideológicas o filosóficas, las creencias religiosas, los datos relativos a la salud, al perfil biológico humano, los datos biométricos, y la información relativa a la vida sexual, a la orientación sexual y a la identidad de género de una persona natural.',
  },
  {
    id: 'dato-personal-19628',
    title: 'Datos personales',
    source: 'Ley 19.628, art. 2',
    group: G1,
    text: 'los relativos a cualquier información concerniente a personas naturales, identificadas o identificables.',
  },
  {
    id: 'dato-sensible-19628',
    title: 'Datos sensibles',
    source: 'Ley 19.628, art. 2',
    group: G1,
    text: 'aquellos datos personales que se refieren a las características físicas o morales de las personas o a hechos o circunstancias de su vida privada o intimidad, tales como los hábitos personales, el origen racial, las ideologías y opiniones políticas, las creencias o convicciones religiosas, los estados de salud físicos o psíquicos y la vida sexual.',
  },
  {
    id: 'responsable-ppt',
    title: 'Responsable',
    source: 'PPT',
    group: G2,
    text: 'persona natural o jurídica, pública o privada, a quien compete decidir acerca del tratamiento de datos personales, con independencia de si los datos son tratados directamente por él o a través de un tercero o mandatario, y de su localización.',
  },
  {
    id: 'responsable-21719',
    title: 'Responsable',
    source: 'Ley 21.719 oficial',
    group: G2,
    text: 'toda persona natural o jurídica, pública o privada, que decide acerca de los fines y medios del tratamiento de datos personales, con independencia de si los datos son tratados directamente por ella o a través de un tercero mandatario o encargado.',
  },
  {
    id: 'encargado-ppt',
    title: 'Encargado',
    source: 'PPT',
    group: G2,
    text: 'el que solo o conjuntamente con otro trate datos por cuenta de otro.',
  },
  {
    id: 'encargado-21719',
    title: 'Tercero mandatario o encargado',
    source: 'Ley 21.719 oficial',
    group: G2,
    text: 'la persona natural o jurídica que trate datos personales, por cuenta del responsable de datos.',
  },
  {
    id: 'falencias-principales',
    title: 'Las 5 falencias principales',
    source: 'Ley 19.628',
    group: G3,
    text: [
      'La falta de un órgano administrativo fiscalizador.',
      'La inexistencia de un procedimiento de reclamo idóneo.',
      'La ausencia de un catálogo de infracciones y sanciones efectivas.',
      'La inexistente regulación para la transferencia internacional de datos.',
      'El no exigir la aplicación de medidas de seguridad.',
    ].join('\n'),
  },
  {
    id: 'falencias-otras',
    title: 'Falencias 6 a 8',
    source: 'Ley 19.628',
    group: G3,
    text: [
      'La falta de autorización de los titulares de datos por un sistema que establece gran cantidad de excepciones al consentimiento.',
      'Ausencia de normas precisas para la responsabilidad civil extracontractual adaptadas al caso.',
      'La inexistencia de tipos penales específicos asociados a la materia.',
    ].join('\n'),
  },
  {
    id: 'principios-nombres',
    title: 'Los 7 principios',
    source: 'Ley 21.719',
    group: G4,
    text: 'Licitud, finalidad, proporcionalidad, calidad, seguridad, responsabilidad, información.',
  },
  {
    id: 'principios-contenido',
    title: 'Contenido de los 7 principios',
    source: 'Ley 21.719',
    group: G4,
    text: [
      'Licitud: el tratamiento necesita una fuente que lo autorice: consentimiento del titular o la ley.',
      'Finalidad: usar el dato solo para el fin informado.',
      'Proporcionalidad: tratar solo los datos necesarios; el riesgo de filtración es directamente proporcional al volumen. Si se puede eliminar, bloquear o anonimizar, hay que hacerlo.',
      'Calidad: exacto, completo, actualizado; responsabilidad compartida con el titular.',
      'Seguridad: evitar filtraciones; invertir, capacitar, limitar accesos.',
      'Responsabilidad: multa y además demanda de indemnización de perjuicios.',
      'Información: informar al titular la finalidad al pedir su autorización.',
    ].join('\n'),
  },
  {
    id: 'ambito-19628',
    title: 'Ámbito de aplicación',
    source: 'Ley 19.628, art. 1',
    group: G5,
    text: 'El tratamiento de los datos de carácter personal en registros o bancos de datos por organismos públicos o por particulares se sujetará a las disposiciones de esta ley, con excepción del que se efectúe en ejercicio de las libertades de emitir opinión y de informar (art. 19 N° 12 de la Constitución). Cualquiera sea la forma (automatizada o manual), por personas naturales o jurídicas.',
  },
  {
    id: 'fuentes-tratamiento',
    title: 'Fuentes del tratamiento',
    source: 'Art. 4',
    group: G6,
    text: 'Solo la ley o el consentimiento expreso del titular.',
  },
  {
    id: 'caracteristicas-consentimiento',
    title: 'Características del consentimiento',
    source: 'Art. 4',
    group: G6,
    text: 'Informado, expreso, escrito, revocable.',
  },
  {
    id: 'derechos-caracteristicas',
    title: 'Características de los derechos del titular',
    source: 'Ley 19.628',
    group: G7,
    text: 'Gratuitos; no pueden limitarse por acto o convención; doble función: los ejerce el titular y también la institución que trata el dato.',
  },
  {
    id: 'derechos-contenido',
    title: 'Los 4 derechos del titular',
    source: 'Ley 19.628',
    group: G7,
    text: [
      'Información: procedencia, destinatario, finalidad e individualización de con quién se comparten los datos regularmente.',
      'Cancelación: eliminar el dato cuando su almacenamiento carezca de fundamento legal, haya caducado, o se haya entregado voluntariamente o se use para comunicaciones comerciales.',
      'Modificación: cuando los datos sean erróneos, inexactos, equívocos o incompletos.',
      'Bloqueo: datos cuya exactitud no pueda establecerse o cuya vigencia sea dudosa, y que no corresponda cancelar.',
    ].join('\n'),
  },
]
